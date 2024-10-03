import { RedisSingleton } from "../utils/redis";
import {
  generateTokens,
  refreshTokens,
  verifyAccessToken,
  verifyRefreshToken,
} from "@b/utils/token";
import { Response } from "./Response";
import { Request } from "./Request";
import { MashServer } from "..";

const isDemo = Boolean(process.env.NEXT_PUBLIC_DEMO_STATUS);
const AUTH_PAGES = ["/logout"];

export async function authenticate(
  res: Response,
  req: Request,
  next: NextFunction
) {
  // Allow preflight requests
  if (req.method === "options") {
    next();
    return;
  }

  if (req.headers.platform && !req.headers.accesstoken) {
    return res.handleError(401, "Authentication Required");
  }

  if (!req.headers.platform && !req.cookies) {
    return res.handleError(401, "Authentication Required");
  }

  const accessToken = req.cookies.accessToken || req.headers.accesstoken;
  if (!accessToken) {
    return attemptRefreshToken(res, req, next).catch((error) => {
      console.error(`JWT Verification Error: ${error.message}`);
      return res.handleError(401, "Authentication Required");
    });
  }

  try {
    const userPayload = await verifyAccessToken(accessToken);
    req.setUser(userPayload.sub);
    return csrfCheck(res, req, next);
  } catch (error) {
    return attemptRefreshToken(res, req, next).catch((err) => {
      console.error(`Error refreshing token: ${err.message}`);
      return res.handleError(401, "Authentication Required");
    });
  }
}

async function attemptRefreshToken(
  res: Response,
  req: Request,
  next: NextFunction
) {
  // Check if there's an existing session for this user
  const sessionId = req.cookies.sessionId || req.headers.sessionid;
  if (!sessionId) {
    return res.handleError(401, "Authentication Required");
  }

  const userSessionKey = `sessionId:${sessionId}`;
  const sessionData = await RedisSingleton.getInstance().get(userSessionKey);

  if (!sessionData) {
    return res.handleError(401, "Authentication Required");
  }

  const { refreshToken: storedRefreshToken, user } = JSON.parse(sessionData);

  if (!storedRefreshToken)
    return res.handleError(401, "Authentication Required");

  // Verify the stored refresh token
  let newTokens;
  try {
    const decoded = await verifyRefreshToken(storedRefreshToken);
    if (!decoded.sub || typeof decoded.sub !== "object" || !decoded.sub.id) {
      // Handle the case where decoded.sub is not structured as expected
      throw new Error("Invalid token structure");
    }

    newTokens = await refreshTokens(decoded.sub, sessionId);
  } catch (error) {
    newTokens = await generateTokens(user);
  }

  req.updateTokens(newTokens);
  req.setUser(user);
  next();
}

async function csrfCheck(res: Response, req: Request, next: NextFunction) {
  try {
    if (req.method.toLowerCase() === "get" || !AUTH_PAGES.includes(req.url)) {
      return next();
    }
  } catch (error) {
    console.error(`CSRF Check Error: ${error.message}`);
    res.handleError(403, "CSRF Check Failed");
  }
  try {
    const csrfToken = req.cookies.csrfToken || req.headers.csrftoken;
    const sessionId = req.cookies.sessionId || req.headers.sessionid;

    if (!csrfToken || !sessionId)
      return res.handleError(403, "CSRF Token or Session ID missing");

    const user = req.getUser();
    if (!user) return res.handleError(401, "Authentication Required");

    const userSessionKey = `sessionId:${user.id}:${sessionId}`;
    const sessionData = await RedisSingleton.getInstance().get(userSessionKey);

    if (!sessionData) return res.handleError(403, "Invalid Session");

    const { csrfToken: storedCSRFToken } = JSON.parse(sessionData);
    if (csrfToken !== storedCSRFToken)
      return res.handleError(403, "Invalid CSRF Token");

    next();
  } catch (error) {
    console.error(`CSRF Check Error: ${error.message}`);
    res.handleError(403, "CSRF Check Failed");
  }
}

export async function rateLimit(
  res: Response,
  req: Request,
  next: NextFunction
) {
  try {
    if (!["post", "put", "patch", "delete"].includes(req.method.toLowerCase()))
      return next();
  } catch (error) {
    console.error(`Rate Limiting Error: ${error.message}`);
    res.handleError(500, "Internal Server Error");
  }
  try {
    const ip = res.getRemoteAddressAsText(); // Get client IP address
    const userRateLimitKey = `rateLimit:${ip}`;
    const limit = 100; // Max number of requests
    const expireTime = 60; // Window size in seconds

    const current = await RedisSingleton.getInstance().get(userRateLimitKey);

    if (current !== null && parseInt(current) >= limit)
      return res.handleError(429, "Rate Limit Exceeded, Try Again Later");

    // Increment the request count for the IP address, setting it to expire after `expireTime` seconds
    await RedisSingleton.getInstance()
      .multi()
      .incr(userRateLimitKey)
      .expire(userRateLimitKey, expireTime)
      .exec();

    next();
  } catch (error) {
    console.error(`Rate Limiting Error: ${error.message}`);
    res.handleError(500, "Internal Server Error");
  }
}

// permissions middleware
export async function rolesGate(
  app: MashServer,
  res: Response,
  req: Request,
  routePath: string,
  method: string,
  next: NextFunction
) {
  const metadata = req.metadata;
  if (!metadata) return next();

  if (!metadata.permission) return next();

  const user = req.getUser();
  if (!user) return res.handleError(401, "Authentication Required");

  const userRole = app.getRole(user.role);

  if (
    !userRole ||
    (!userRole.permissions.includes(metadata.permission) &&
      userRole.name !== "Super Admin")
  )
    return res.handleError(
      403,
      "Forbidden - You do not have permission to access this"
    );

  if (
    isDemo &&
    routePath.startsWith("/api/admin") &&
    ["post", "put", "delete", "del"].includes(method) &&
    userRole.name !== "Super Admin"
  ) {
    res.handleError(403, "Action not allowed in demo mode");
    return;
  }

  next();
}

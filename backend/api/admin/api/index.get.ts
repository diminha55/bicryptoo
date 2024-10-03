// /server/api/admin/apiKeys/index.get.ts

import { models } from "@b/db";

import { crudParameters, paginationSchema } from "@b/utils/constants";
import {
  getFiltered,
  notFoundMetadataResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from "@b/utils/query";
import { apiKeySchema } from "./utils";

export const metadata: OperationObject = {
  summary: "Lists all API keys with pagination and optional user filtering",
  operationId: "listAPIKeys",
  tags: ["Admin", "API Keys"],
  parameters: crudParameters,
  responses: {
    200: {
      description:
        "List of API keys with user details and pagination information",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: apiKeySchema,
                },
              },
              pagination: paginationSchema,
            },
          },
        },
      },
    },
    401: unauthorizedResponse,
    404: notFoundMetadataResponse("API Keys"),
    500: serverErrorResponse,
  },
  requiresAuth: true,
  permission: "Access API Key Management",
};

export default async (data: Handler) => {
  const { query } = data;

  return getFiltered({
    model: models.apiKey,
    query,
    sortField: query.sortField || "createdAt",
    includeModels: [
      {
        model: models.user,
        as: "user",
        attributes: ["firstName", "lastName", "email", "avatar"],
      },
    ],
  });
};

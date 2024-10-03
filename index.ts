// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
require("dotenv").config();
import "./module-alias-setup";
import { setupSwaggerRoute } from "@b/docs";
import { setupApiRoutes } from "@b/handler/Routes";
import { MashServer } from "@b/index";
import { setupDefaultRoutes, setupProcessEventHandlers } from "@b/utils";
import { rolesManager } from "@b/utils/roles";
import * as path from "path";
import "@b/db";
import { models } from "@b/db";
import { initialize } from "@b/utils/eco/scylla/client";
import { MatchingEngine } from "@b/utils/eco/matchingEngine";
import { baseUrl } from "@b/utils/constants";
import CronJobManager, { createWorker } from "@b/utils/cron";

export const settings = new Map<string, any>();
export const extensions = new Map<string, any>();

const isProduction = process.env.NODE_ENV === "production";
const port = process.env.BACKEND_PORT || 4000;

const app = new MashServer();
app.cors();

const initializeApp = async () => {
  try {
    const extensionsData = await models.extension.findAll({
      where: { status: true },
    });
    extensionsData.forEach((extension) => {
      extensions.set(extension.name, extension);
    });

    await rolesManager.initialize();
    app.setRoles(rolesManager.roles);

    setupApiRoutes(app, path.join(baseUrl, "api"));
    setupSwaggerRoute(app);
    setupDefaultRoutes(app);

    if (isProduction) {
      try {
        const cronJobs = CronJobManager.getInstance().getCronJobs();

        for (const job of cronJobs) {
          createWorker(job.name, job.function, job.period);
        }
      } catch (error) {
        console.error("Error initializing cron jobs:", error);
      }
    }

    app.listen(Number(port), () => {
      console.log(`Server running on port ${port}`);
    });

    const settingsData = await models.settings.findAll();
    settingsData.forEach((setting) => {
      settings.set(setting.key, setting.value);
    });

    if (extensions.has("ecosystem")) {
      await initialize();
      await MatchingEngine.getInstance();
    }
  } catch (error) {
    console.error("Error during application initialization:", error);
    process.exit(1);
  }
};

// Handle process events for logging and cleanup
setupProcessEventHandlers();

initializeApp().catch((error) => {
  console.error("Failed to initialize app:", error);
});

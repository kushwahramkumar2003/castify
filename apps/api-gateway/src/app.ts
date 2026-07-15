import express from "express";
import cors from "cors";
import type { Application } from "express";
import { config } from "./config.ts";
import { logger } from "./logger.ts";
import { rateLimiter } from "./rateLimiter.ts";
import { createRoutes } from "./routes.ts";

export function createApp(): Application {
  const app = express();

  const origins = config.CORS_ORIGINS.split(",").map((o) => o.trim());
  app.use(
    cors({
      origin: origins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    })
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  app.use(rateLimiter);

  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      logger.info(
        { method: req.method, path: req.path, status: res.statusCode, ms },
        "←"
      );
    });
    next();
  });

  app.use(createRoutes());

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      logger.error({ err }, "Unhandled error");
      res.status(500).json({ error: "Internal server error" });
    }
  );

  return app;
}

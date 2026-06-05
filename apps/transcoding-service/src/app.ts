import express, { type Request, type Response, type NextFunction } from "express";
import { createHealthRouter } from "./routes/health.ts";
import { logger } from "./logger.ts";
import type { WorkerPool } from "./worker/workerPool.ts";

export function createApp(pool: WorkerPool) {
  const app = express();

  app.use(express.json());

  // Request logging (skip /health to avoid log spam)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      if (req.path.startsWith("/health")) return;
      logger.info({ method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start }, "→");
    });
    next();
  });

  app.use("/health", createHealthRouter(pool));

  // 404
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "not found" });
  });

  // Error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ error: "internal server error" });
  });

  return app;
}

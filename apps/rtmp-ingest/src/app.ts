import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { logger } from "./config.ts";
import { healthRouter } from "./routes/health.ts";
import { rtmpRouter } from "./routes/rtmp.ts";

export function createApp() {
  const app = express();

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    res.on("finish", () => {
      if (req.path === "/health") return;
      logger.info(
        {
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Date.now() - start,
        },
        "→ request"
      );
    });

    next();
  });

  app.use("/health", healthRouter);
  app.use("/rtmp", rtmpRouter);

  app.use((req: Request, res: Response) => {
    logger.warn({ path: req.path }, "404 not found");
    res.status(404).json({ error: "not found" });
  });

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err, path: req.path }, "Unhandled error");
    res.status(500).json({ error: "internal server error" });
  });

  return app;
}

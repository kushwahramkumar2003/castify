import { Router, type Request, type Response } from "express";
import type { WorkerPool } from "../worker/workerPool.ts";
import { config } from "../config.ts";

// =============================================================================
// Health route — used by:
//   • docker-compose healthcheck
//   • load balancer / orchestrator readiness probe
//   • auto-scaler (reads utilization + queueDepth to decide scale-up/down)
// =============================================================================

export function createHealthRouter(pool: WorkerPool) {
  const router = Router();

  // GET /health
  // Returns 200 while the service is operational.
  // Returns 503 if the pool utilization is at 100% (no capacity for new streams).
  router.get("/", (_req: Request, res: Response) => {
    const stats = pool.getStats();
    const isHealthy = stats.utilization < 1.0 || stats.queueDepth === 0;

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? "ok" : "at_capacity",
      service: "transcoding-service",
      instance: config.INSTANCE_ID,
      timestamp: new Date().toISOString(),
      pool: stats,
      config: {
        maxConcurrentStreams: config.MAX_CONCURRENT_STREAMS,
        qualities: config.FFMPEG_QUALITIES,
        ffmpegPreset: config.FFMPEG_PRESET,
        hlsSegmentSeconds: config.HLS_SEGMENT_SECONDS,
      },
    });
  });

  // GET /health/ready — simple liveness probe (no pool info, faster)
  router.get("/ready", (_req: Request, res: Response) => {
    res.status(200).json({ ready: true, instance: config.INSTANCE_ID });
  });

  return router;
}

import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { logger } from "./logger.ts";
import { WorkerPool } from "./worker/workerPool.ts";
import { connectConsumer, disconnectConsumer } from "./kafka/consumer.ts";
import { connectProducer, disconnectProducer } from "./kafka/producer.ts";

// =============================================================================
// transcoding-service — entry point
// =============================================================================
//
// Startup sequence (order matters):
//   1. Validate env (config.ts — happens at import time, exits on bad config)
//   2. Ensure MinIO bucket exists
//   3. Connect Kafka producer (needed before first segment is uploaded)
//   4. Connect Kafka consumer (starts consuming stream.started/stream.ended)
//   5. Start Express HTTP server (health checks)
//
// Shutdown sequence (SIGINT / SIGTERM):
//   1. Stop accepting new streams (disconnect consumer)
//   2. Stop all active FFmpeg processes gracefully (SIGINT → EXT-X-ENDLIST)
//   3. Disconnect Kafka producer
//   4. Exit
// =============================================================================

const pool = new WorkerPool();
const app  = createApp(pool);

async function start(): Promise<void> {
  logger.info({ instanceId: config.INSTANCE_ID }, "Starting transcoding-service…");

  // 1. Kafka producer
  try {
    await connectProducer();
  } catch (err) {
    logger.fatal({ err }, "Cannot connect Kafka producer — exiting");
    process.exit(1);
  }

  // 2. Kafka consumer (starts listening immediately)
  try {
    await connectConsumer(pool);
  } catch (err) {
    logger.fatal({ err }, "Cannot connect Kafka consumer — exiting");
    process.exit(1);
  }

  // 4. Express health server
  app.listen(config.PORT, () => {
    logger.info(`
  ┌─────────────────────────────────────────────────────────────┐
  │  transcoding-service is running                             │
  │                                                             │
  │  Instance:    ${config.INSTANCE_ID.padEnd(41)}│
  │  Port:        ${String(config.PORT).padEnd(41)}│
  │  Qualities:   ${config.FFMPEG_QUALITIES.padEnd(41)}│
  │  Preset:      ${config.FFMPEG_PRESET.padEnd(41)}│
  │  Max streams: ${String(config.MAX_CONCURRENT_STREAMS).padEnd(41)}│
  │                                                             │
  │  Health:  http://localhost:${config.PORT}/health                    │
  │  Waiting: Kafka stream.started events…                      │
  └─────────────────────────────────────────────────────────────┘
    `);
  });
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutdown signal — draining workers…");

  await disconnectConsumer();       // stop receiving new events
  await pool.drainAll();            // stop all active FFmpeg processes
  await disconnectProducer();

  logger.info("Shutdown complete — goodbye");
  process.exit(0);
}

process.on("SIGINT",  () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception — exiting");
  process.exit(1);
});

void start();

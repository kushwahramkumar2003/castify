import { config } from "./config.ts";
import { logger } from "./logger.ts";
import { ensureBucket } from "./storage.ts";
import { connectConsumer, disconnectConsumer } from "./kafka.ts";

async function start(): Promise<void> {
  logger.info({ instanceId: config.INSTANCE_ID }, "Starting hls-packager…");
  try {
    await ensureBucket();
    logger.info({ bucket: config.STORAGE_BUCKET }, "Storage bucket ready");
  } catch (err) {
    logger.fatal({ err }, "Cannot connect to storage — exiting");
    process.exit(1);
  }

  try {
    await connectConsumer();
  } catch (err) {
    logger.fatal({ err }, "Cannot connect Kafka consumer — exiting");
    process.exit(1);
  }

  logger.info(`
  ┌─────────────────────────────────────────────────────────────┐
  │  hls-packager is running                                    │
  │                                                             │
  │  Instance:    ${config.INSTANCE_ID.padEnd(41)}│
  │  Port:        ${String(config.PORT).padEnd(41)}│
  │  Storage:     ${config.STORAGE_ENDPOINT}:${String(config.STORAGE_PORT).padEnd(41)}│
  │  Bucket:      ${config.STORAGE_BUCKET.padEnd(41)}│
  │                                                             │
  │  Waiting: Kafka video.segment.ready events…                 │
  └─────────────────────────────────────────────────────────────┘
  `);
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutdown signal received");
  await disconnectConsumer();
  logger.info("Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

void start();

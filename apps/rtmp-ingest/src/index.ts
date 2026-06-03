import { createApp } from "./app.ts";
import { config, logger } from "./config.ts";
import { kafkaService } from "./services/kafkaService.ts";

const app = createApp();

async function start() {
  logger.info("Starting rtmp-ingest...");

  try {
    await kafkaService.connect();
  } catch (err) {
    logger.fatal({ err }, "Cannot connect to Kafka — exiting");
    process.exit(1);
  }

  app.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, env: config.NODE_ENV },
      `rtmp-ingest listening on :${config.PORT}`
    );

    logger.info(`
  ┌────────────────────────────────────────────────────────┐
  │  rtmp-ingest is running (Express on Bun)               │
  │                                                        │
  │  Health:   http://localhost:${config.PORT}/health              │
  │                                                        │
  │  Endpoints nginx calls:                                │
  │    POST /rtmp/on-publish       (stream starts)         │
  │    POST /rtmp/on-publish-done  (stream ends)           │
  │    POST /rtmp/on-play          (viewer connects)       │
  │                                                        │
  │  OBS → rtmp://localhost:1935/live/<stream-key>         │
  └────────────────────────────────────────────────────────┘
    `);
  });
}

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutdown signal received — closing rtmp-ingest");
  try {
    await kafkaService.disconnect();
    logger.info("Kafka producer disconnected — goodbye");
  } catch (err) {
    logger.error({ err }, "Error during Kafka disconnect");
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception — exiting");
  process.exit(1);
});

start();

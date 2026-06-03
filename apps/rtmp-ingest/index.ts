import { createApp } from "./src/app.ts";
import { config } from "./src/config.ts";
import { logger } from "./src/config.ts";
import { kafkaService } from "./src/services/kafkaService.ts";

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
      { port: config.PORT },
      `rtmp-ingest listening on :${config.PORT}`
    );
  });
}

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutdown signal received");
  try {
    await kafkaService.disconnect();
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
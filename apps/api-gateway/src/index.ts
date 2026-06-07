import { config } from "./config.ts";
import { logger } from "./logger.ts";
import { createApp } from "./app.ts";

const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info(`
  ┌─────────────────────────────────────────────────────────────┐
  │  api-gateway is running                                     │
  │                                                             │
  │  Port:        ${String(config.PORT).padEnd(41)}│
  │  Auth URL:    ${config.AUTH_SERVICE_URL.padEnd(41)}│
  │  CORS:        ${config.CORS_ORIGINS.split(",")[0]!.trim().padEnd(41)}│
  │                                                             │
  │  Routes:      http://localhost:${config.PORT}/api/*                      │
  │  Health:      http://localhost:${config.PORT}/api/health                │
  └─────────────────────────────────────────────────────────────┘
  `);
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutdown signal received");

  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 5_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

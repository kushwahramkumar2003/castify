import { createLogger } from "@castify/logger";
import { config } from "./config";

export const logger = createLogger({
  serviceName: "chat-service",
  level: config.LOG_LEVEL,
  env: config.NODE_ENV,
});

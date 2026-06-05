import { createLogger } from "@castify/logger";
import { config } from "./config.ts";

export const logger = createLogger({
  serviceName: "transcoding-service",
  level: config.LOG_LEVEL,
  env: config.NODE_ENV,
});

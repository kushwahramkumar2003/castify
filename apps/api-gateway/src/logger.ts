import { pino } from "pino";
import { config } from "./config.ts";

export const logger = pino({
  name: "api-gateway",
  level: config.LOG_LEVEL,
  transport:
    config.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  mixin() {
    return { service: "api-gateway", env: config.NODE_ENV };
  },
});

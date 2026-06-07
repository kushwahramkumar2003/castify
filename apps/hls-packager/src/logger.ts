import { pino } from "pino";
import { config } from "./config.ts";

export const logger = pino({
  name: "hls-packager",
  level: config.LOG_LEVEL,
  transport:
    config.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  mixin() {
    return { service: "hls-packager", env: config.NODE_ENV };
  },
});

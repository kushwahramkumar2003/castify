import pino from "pino";

export interface LoggerOptions {
  serviceName: string;
  level?: string;
  env?: string;
}

export type Logger = pino.Logger;

export function createLogger(options: LoggerOptions): Logger {
  const { serviceName, level = "info", env = "development" } = options;

  return pino({
    level,
    ...(env === "development"
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "SYS:HH:MM:ss",
              ignore: "pid,hostname",
              messageFormat: `[${serviceName}] {msg}`,
            },
          },
        }
      : {}),
    base: {
      service: serviceName,
      env,
    },
  });
}

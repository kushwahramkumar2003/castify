import { createRequire } from "node:module";
import pino from "pino";

export interface LoggerOptions {
  serviceName: string;
  level?: string;
  env?: string;
}

export type Logger = pino.Logger;

const require = createRequire(import.meta.url);

/** Resolve pino-pretty from this package so monorepo apps don't need a local copy. */
function resolvePrettyTarget(): string | null {
  try {
    return require.resolve("pino-pretty");
  } catch {
    return null;
  }
}

export function createLogger(options: LoggerOptions): Logger {
  const { serviceName, level = "info", env = "development" } = options;
  const prettyTarget =
    env === "development" || env === "test" ? resolvePrettyTarget() : null;

  return pino({
    level,
    ...(prettyTarget
      ? {
          transport: {
            target: prettyTarget,
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

import { createConfig, baseEnvSchema, kafkaEnvSchema, z } from "@castify/config";
import { createLogger } from "@castify/logger";


const envSchema = baseEnvSchema
  .merge(kafkaEnvSchema)
  .extend({
    PORT: z.coerce.number().default(3001),
    KAFKA_CLIENT_ID: z.string().default("rtmp-ingest"),

    AUTH_SERVICE_URL: z.string().url().default("http://localhost:3000"),

    KAFKA_TOPIC_STREAM_STARTED: z.string().default("stream.started"),
    KAFKA_TOPIC_STREAM_ENDED: z.string().default("stream.ended"),

    NGINX_RTMP_APP: z.string().default("live"),

    NGINX_CONTROL_URL: z
      .string()
      .url()
      .default("http://localhost:8080/control"),

    STREAM_KEY_CACHE_TTL_SEC: z.coerce.number().default(30),
  });

export const config = createConfig(envSchema, "rtmp-ingest");
export type Config = typeof config;

export const logger = createLogger({
  serviceName: "rtmp-ingest",
  level: config.LOG_LEVEL,
  env: config.NODE_ENV,
});

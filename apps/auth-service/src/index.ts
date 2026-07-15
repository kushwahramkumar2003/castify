import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import { config } from "./config";
import { startStreamAutoEndJob } from "./jobs/streamAutoEnd";
import routes from "./routes";

const app = express();

// ---------------------------------------------------------------------------
// CORS — must run before body parsers so OPTIONS preflight never hits routes.
// Browser (web :3200) talks to auth-service (:3000) directly; api-gateway
// CORS_ORIGINS does not cover this path.
// ---------------------------------------------------------------------------
const corsOrigins = new Set(
  config.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

// Dev convenience: always allow the Next.js app even if env was edited
// after the process started with a stale list (or only gateway was updated).
if (config.NODE_ENV !== "production") {
  for (const o of [
    "http://localhost:3200",
    "http://127.0.0.1:3200",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]) {
    corsOrigins.add(o);
  }
}

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      // Non-browser / same-origin tools omit Origin
      if (!origin) {
        callback(null, true);
        return;
      }
      if (corsOrigins.has(origin)) {
        // With credentials, reflect the exact origin (do not use *)
        callback(null, origin);
        return;
      }
      console.warn(
        `[auth-service] CORS blocked origin=${origin}. Allowed: ${[...corsOrigins].join(", ")}`
      );
      callback(null, false);
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  })
);

app.use(express.json());
app.use(cookieParser());

app.use("/api/v1", routes);

app.listen(config.PORT, () => {
  console.log(`[auth-service] Listening on port ${config.PORT}`);
  console.log(
    `[auth-service] CORS origins (${corsOrigins.size}): ${[...corsOrigins].join(", ")}`
  );
  startStreamAutoEndJob();
});

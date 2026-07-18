import http from "node:http";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config } from "./config";
import { logger } from "./logger";
import { createRoutes } from "./http/routes";
import { setSocketManager } from "./app-context";
import { SocketManager } from "./ws/socket-manager";

const app = express();

const corsOrigins = new Set(
  config.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean)
);
if (config.NODE_ENV !== "production") {
  corsOrigins.add("http://localhost:3200");
  corsOrigins.add("http://127.0.0.1:3200");
}

app.use(
  cors({
    credentials: true,
    origin(origin, cb) {
      if (!origin || corsOrigins.has(origin)) cb(null, origin || true);
      else cb(null, false);
    },
  })
);
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
app.use("/api/v1/chat", createRoutes());

const server = http.createServer(app);
const socketManager = new SocketManager(server, "/ws");
setSocketManager(socketManager);

const shutdown = () => {
  logger.info("shutting down chat-service");
  socketManager.close();
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "chat-service listening");
  logger.info({ ws: `ws://localhost:${config.PORT}/ws` }, "websocket endpoint");
});

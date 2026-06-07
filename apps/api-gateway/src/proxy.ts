import {
  createProxyMiddleware,
  type RequestHandler,
} from "http-proxy-middleware";
import type { Request, Response, NextFunction } from "express";
import { logger } from "./logger";
import { config } from "./config";

type ProxyConfig = {
  prefix: string; // URL prefix to strip, e.g. "/api/auth"
  target: string; // Internal service URL
  authRequired?: boolean; // if true, blocks unauthenticated requests
};

function createServiceProxy(cfg: ProxyConfig): RequestHandler {
  return createProxyMiddleware({
    target: cfg.target,
    changeOrigin: true,
    pathRewrite: (path: string) => path.replace(cfg.prefix, ""),

    on: {
      proxyReq: (proxyReq, req) => {
        const user = (req as Request).user;
        if (user) {
          proxyReq.setHeader("X-User-Id", user.sub);
          proxyReq.setHeader("X-Username", user.username);
        }

        if ((req as Request).body && !proxyReq.getHeader("Content-Type")) {
          const body = JSON.stringify((req as Request).body);
          proxyReq.setHeader("Content-Type", "application/json");
          proxyReq.setHeader(
            "Content-Length",
            Buffer.byteLength(body).toString()
          );
          proxyReq.write(body);
        }
      },

      proxyRes: (proxyRes, req) => {
        logger.info(
          {
            method: req.method,
            path: req.url,
            status: proxyRes.statusCode,
            ms: 0,
          },
          "→"
        );
      },

      error: (err, req, res) => {
        const target = res as unknown as Response;
        logger.error({ err, method: req.method, path: req.url }, "Proxy error");
        if (!target.headersSent) {
          target.status(502).json({ error: "Service temporarily unavailable" });
        }
      },
    },
  });
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

export const authProxy = createServiceProxy({
  prefix: "/api/auth",
  target: config.AUTH_SERVICE_URL,
});

export const streamProxy = createServiceProxy({
  prefix: "/api/streams",
  target: config.METADATA_SERVICE_URL,
});

export const vodProxy = createServiceProxy({
  prefix: "/api/vods",
  target: config.VOD_SERVICE_URL,
});

export const clipProxy = createServiceProxy({
  prefix: "/api/clips",
  target: config.VOD_SERVICE_URL,
});

export const chatProxy = createServiceProxy({
  prefix: "/api/chat",
  target: config.CHAT_SERVICE_URL,
});

export const presenceProxy = createServiceProxy({
  prefix: "/api/presence",
  target: config.PRESENCE_SERVICE_URL,
});

export const notificationProxy = createServiceProxy({
  prefix: "/api/notifications",
  target: config.NOTIFICATION_SERVICE_URL,
});

export const analyticsProxy = createServiceProxy({
  prefix: "/api/analytics",
  target: config.ANALYTICS_SERVICE_URL,
});

export const moderationProxy = createServiceProxy({
  prefix: "/api/moderation",
  target: config.MODERATION_SERVICE_URL,
});

export const reactionProxy = createServiceProxy({
  prefix: "/api/reactions",
  target: config.REACTION_SERVICE_URL,
});

export { requireAuth };

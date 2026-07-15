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
  pathRewrite?: (path: string) => string;
};

function createServiceProxy(cfg: ProxyConfig): RequestHandler {
  return createProxyMiddleware({
    target: cfg.target,
    changeOrigin: true,
    pathRewrite: cfg.pathRewrite || ((path: string) => path.replace(cfg.prefix, "")),

    on: {
      proxyReq: (proxyReq, req) => {
        // ── Security: always strip identity headers before re-setting them.
        // A malicious client could inject X-User-Id to impersonate another user.
        proxyReq.removeHeader("X-User-Id");
        proxyReq.removeHeader("X-Username");
        proxyReq.removeHeader("X-Gateway-Verified");
        proxyReq.removeHeader("X-Internal-Secret");

        const user = (req as Request).user;
        if (user) {
          // Only set these after the gateway has cryptographically verified the JWT.
          proxyReq.setHeader("X-User-Id", user.sub);
          proxyReq.setHeader("X-Username", user.username);
          proxyReq.setHeader("X-Gateway-Verified", "true"); // internal trust flag
          proxyReq.setHeader("X-Internal-Secret", config.INTERNAL_SECRET);
        }

        // Re-write the body for parsed JSON payloads (needed because body-parser
        // consumes the stream; we must re-serialise and set Content-Length).
        const body = (req as Request).body;
        if (body && Object.keys(body).length > 0 && !proxyReq.getHeader("Content-Type")) {
          const bodyStr = JSON.stringify(body);
          proxyReq.setHeader("Content-Type", "application/json");
          proxyReq.setHeader("Content-Length", Buffer.byteLength(bodyStr).toString());
          proxyReq.write(bodyStr);
        }
      },

      proxyRes: (proxyRes, req) => {
        logger.info(
          {
            method: req.method,
            path: req.url,
            status: proxyRes.statusCode,
            target: cfg.target,
          },
          "→ proxy"
        );
      },

      error: (err, req, res) => {
        const target = res as unknown as Response;
        logger.error({ err, method: req.method, path: req.url, target: cfg.target }, "Proxy error");
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

// ---------------------------------------------------------------------------
// Auth Service proxy
// ---------------------------------------------------------------------------
// IMPORTANT: Express's router.use("/api/auth", authProxy) STRIPS the mount
// prefix before the middleware sees req.url. So a request to /api/auth/login
// arrives here as just "/login".
//
// Routes called directly as a handler (router.get("/api/users/me", ..., authProxy))
// see the FULL path: "/api/users/me".
//
// The pathRewrite must handle BOTH cases:
//   Full path  → /api/users/me      → /api/v1/user/me
//   Stripped   → /login             → /api/v1/auth/login
// ---------------------------------------------------------------------------
export const authProxy = createServiceProxy({
  prefix: "/api/auth",
  target: config.AUTH_SERVICE_URL,
  pathRewrite: (path: string) => {
    // Full-path calls from explicit route handlers
    if (path.startsWith("/api/users")) {
      return path.replace("/api/users", "/api/v1/user");
    }
    if (path.startsWith("/api/stream-key")) {
      return "/api/v1/user/stream-key";
    }
    // Full-path /api/auth/... (shouldn't happen but guard it anyway)
    if (path.startsWith("/api/auth")) {
      return path.replace("/api/auth", "/api/v1/auth");
    }
    // Stripped path from router.use("/api/auth", authProxy)
    // e.g. "/login" → "/api/v1/auth/login"
    //      "/signup" → "/api/v1/auth/signup"
    return "/api/v1/auth" + path;
  },
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

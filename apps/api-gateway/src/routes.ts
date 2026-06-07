import { Router } from "express";
import {
  authProxy,
  streamProxy,
  vodProxy,
  clipProxy,
  chatProxy,
  presenceProxy,
  reactionProxy,
  notificationProxy,
  analyticsProxy,
  moderationProxy,
  requireAuth,
} from "./proxy.ts";
import { authenticate, optionalAuth } from "./auth.ts";

export function createRoutes(): Router {
  const router = Router();

  router.use("/api/auth", authProxy);
  router.use("/api/streams", optionalAuth, streamProxy);
  router.get("/api/stream-key", authenticate, (req, res, next) => {
    // This is a special route — generate stream key for the logged-in user.
    // Forwarded to auth-service but the path doesn't match a REST resource,
    // so we handle it explicitly rather than through the generic proxy.
    authProxy(req, res, next);
  });
  router.get("/api/vods", optionalAuth, vodProxy);
  router.get("/api/vods/:id", optionalAuth, vodProxy);
  router.post("/api/vods", authenticate, vodProxy);
  router.delete("/api/vods/:id", authenticate, vodProxy);
  router.get("/api/clips", optionalAuth, clipProxy);
  router.post("/api/clips", authenticate, clipProxy);
  router.get("/api/chat/:streamId/messages", optionalAuth, chatProxy);
  router.post("/api/chat/:streamId/messages", authenticate, chatProxy);
  router.get("/api/presence/:streamId", optionalAuth, presenceProxy);
  router.post("/api/presence/:streamId/join", optionalAuth, presenceProxy);
  router.post("/api/presence/:streamId/leave", optionalAuth, presenceProxy);
  router.post("/api/reactions/:streamId", authenticate, reactionProxy);
  router.get("/api/reactions/:streamId", optionalAuth, reactionProxy);
  router.get("/api/notifications", authenticate, notificationProxy);
  router.patch("/api/notifications/:id/read", authenticate, notificationProxy);
  router.put("/api/notifications/preferences", authenticate, notificationProxy);
  router.get("/api/analytics/streams/:streamId", authenticate, analyticsProxy);
  router.get(
    "/api/analytics/streams/:streamId/viewers",
    authenticate,
    analyticsProxy
  );
  router.get(
    "/api/analytics/streams/:streamId/chat-rate",
    authenticate,
    analyticsProxy
  );
  router.get(
    "/api/moderation/streams/:streamId/bans",
    authenticate,
    moderationProxy
  );
  router.post(
    "/api/moderation/streams/:streamId/bans",
    authenticate,
    moderationProxy
  );
  router.delete(
    "/api/moderation/streams/:streamId/bans/:userId",
    authenticate,
    moderationProxy
  );
  router.get(
    "/api/moderation/streams/:streamId/banned-words",
    authenticate,
    moderationProxy
  );
  router.post(
    "/api/moderation/streams/:streamId/banned-words",
    authenticate,
    moderationProxy
  );

  router.get("/api/users/me", authenticate, (req, res, next) => {
    authProxy(req, res, next);
  });
  router.patch("/api/users/me", authenticate, (req, res, next) => {
    authProxy(req, res, next);
  });
  router.get("/api/users/:username", optionalAuth, (req, res, next) => {
    authProxy(req, res, next);
  });
  router.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "api-gateway",
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}

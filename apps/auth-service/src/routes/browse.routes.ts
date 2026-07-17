import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  browseStreams,
  browseStreamById,
  streamHeartbeat,
  streamLeave,
} from "../controller/browse.controller";
import { redeemInvite } from "../controller/invite.controller";
import { rateLimit } from "../middleware/rateLimiter";

const router = Router();

router.get("/streams", authMiddleware, browseStreams);
router.get("/streams/:streamId", authMiddleware, browseStreamById);
router.post("/streams/:streamId/heartbeat", authMiddleware, streamHeartbeat);
router.post("/streams/:streamId/leave", authMiddleware, streamLeave);

// Join via invite code (logged-in viewers)
router.post("/join", authMiddleware, rateLimit(10, 60_000), redeemInvite);

export default router;

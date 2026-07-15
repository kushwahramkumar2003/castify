import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  browseStreams,
  browseStreamById,
  streamHeartbeat,
  streamLeave,
} from "../controller/browse.controller";

const router = Router();

// All browse/watch APIs require a logged-in Castify account
router.get("/streams", authMiddleware, browseStreams);
router.get("/streams/:streamId", authMiddleware, browseStreamById);
router.post("/streams/:streamId/heartbeat", authMiddleware, streamHeartbeat);
router.post("/streams/:streamId/leave", authMiddleware, streamLeave);

export default router;

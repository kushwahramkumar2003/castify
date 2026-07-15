import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  getMe,
  updateMe,
  changePassword,
  getPublicProfile,
  getMyStreams,
  getMyVods,
  createStream,
  getStreamById,
  endStream,
} from "../controller/user.controller";
import {
  getStreamKeys,
  createStreamKey,
  revokeStreamKey,
  regenerateStreamKey,
  getStreamKeysForStream,
  rotateStreamKeys,
} from "../controller/stream-key.controller";
import {
  follow,
  unfollow,
  getFollowing,
  getFollowers,
  followStatus,
} from "../controller/follow.controller";

const router = Router();

router.get("/me", authMiddleware, getMe);
router.patch("/me", authMiddleware, updateMe);
router.post("/change-password", authMiddleware, changePassword);

router.get("/streams", authMiddleware, getMyStreams);
router.post("/streams", authMiddleware, createStream);
router.get("/streams/:streamId", authMiddleware, getStreamById);
router.post("/streams/:streamId/end", authMiddleware, endStream);
router.get("/streams/:streamId/keys", authMiddleware, getStreamKeysForStream);
router.post("/streams/:streamId/keys/rotate", authMiddleware, rotateStreamKeys);
router.get("/vods", authMiddleware, getMyVods);

router.get("/stream-keys", authMiddleware, getStreamKeys);
router.post("/stream-keys", authMiddleware, createStreamKey);
router.post("/stream-keys/revoke", authMiddleware, revokeStreamKey);
router.post("/stream-keys/regenerate", authMiddleware, regenerateStreamKey);

router.post("/follow/:username", authMiddleware, follow);
router.delete("/follow/:username", authMiddleware, unfollow);
router.get("/follow/:username/status", authMiddleware, followStatus);

router.get("/following", authMiddleware, getFollowing);
router.get("/followers", authMiddleware, getFollowers);

// Profile — prefer auth so clients can attach follow state later
router.get("/:username", authMiddleware, getPublicProfile);

export default router;

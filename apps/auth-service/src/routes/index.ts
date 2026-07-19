import { Router } from "express";
import auth from "./auth.routes";
import user from "./user.routes";
import browse from "./browse.routes";
import library from "./library.routes";
import billing from "./billing.routes";
import {
  validateStreamKey,
  startStreamInternal,
  streamOfflineInternal,
  endStreamInternal,
} from "../controller/stream-key.controller";
import { rateLimit } from "../middleware/rateLimiter";
import { requireInternalAuth } from "../middleware/internal.middleware";

const router = Router();

router.use("/auth", auth);
router.use("/user", user);
router.use("/browse", browse);
router.use("/library", library);
router.use("/billing", billing);

// Internal routes for rtmp-ingest stream key validation and state updates
router.use("/internal", requireInternalAuth);
router.post("/internal/validate-stream-key", rateLimit(30, 1_000), validateStreamKey);
router.post("/internal/streams/:streamId/start", startStreamInternal);
router.post("/internal/streams/:streamId/offline", streamOfflineInternal);
router.post("/internal/streams/:streamId/end", endStreamInternal);

export default router;

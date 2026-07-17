import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  libraryLive,
  libraryVods,
  libraryVodById,
} from "../controller/library.controller";

const router = Router();

router.get("/live", authMiddleware, libraryLive);
router.get("/vods", authMiddleware, libraryVods);
router.get("/vods/:vodId", authMiddleware, libraryVodById);

export default router;

import { Router } from "express";
import { signup, login } from "../controller/auth.controller";
import {
  listProviders,
  logout,
  startOAuth,
  oauthCallback,
  issueChatToken,
} from "../controller/oauth.controller";
import { rateLimit } from "../middleware/rateLimiter";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.post("/signup", rateLimit(5, 60_000), signup);
router.post("/login", rateLimit(5, 60_000), login);
router.post("/logout", logout);
router.get("/chat-token", authMiddleware, rateLimit(30, 60_000), issueChatToken);

router.get("/oauth/providers", listProviders);
router.get("/oauth/:provider", rateLimit(30, 60_000), startOAuth);
router.get("/oauth/:provider/callback", rateLimit(30, 60_000), oauthCallback);

export default router;

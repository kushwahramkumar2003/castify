import { Router } from "express";
import { signup, login } from "../controller/auth.controller";
import { rateLimit } from "../middleware/rateLimiter";

const router = Router();

// 5 attempts per 60s window for login/signup
router.post("/signup", rateLimit(5, 60_000), signup);
router.post("/login",  rateLimit(5, 60_000), login);

export default router;

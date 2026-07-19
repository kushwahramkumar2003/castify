import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { rateLimit } from "../middleware/rateLimiter";
import {
  listBillingPlans,
  getMyBillingSubscription,
  createSubscriptionCheckout,
  verifySubscriptionPayment,
  cancelMySubscription,
} from "../controller/billing.controller";

const router = Router();

router.get("/plans", rateLimit(60, 60_000), listBillingPlans);
router.get("/subscription", authMiddleware, getMyBillingSubscription);
router.post(
  "/subscribe",
  authMiddleware,
  rateLimit(10, 60_000),
  createSubscriptionCheckout
);
router.post(
  "/verify",
  authMiddleware,
  rateLimit(20, 60_000),
  verifySubscriptionPayment
);
router.post(
  "/cancel",
  authMiddleware,
  rateLimit(10, 60_000),
  cancelMySubscription
);

export default router;

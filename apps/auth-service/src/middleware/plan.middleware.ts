import type { NextFunction, Request, Response } from "express";
import { prisma } from "@castify/db";
import {
  normalizePlan,
  planMeetsMinimum,
  type PlanTier,
} from "../plans/qualityEntitlements";

declare global {
  namespace Express {
    interface Request {
      /** Resolved after attachUserPlan / requireMinPlan */
      plan?: PlanTier;
    }
  }
}

/**
 * Load the authenticated user's billing plan onto `req.plan`.
 * Must run after `authMiddleware`.
 */
export async function attachUserPlan(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.userId) {
    res
      .status(401)
      .json({ success: false, message: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { plan: true },
    });
    if (!user) {
      res
        .status(401)
        .json({ success: false, message: "User not found", code: "UNAUTHORIZED" });
      return;
    }
    req.plan = normalizePlan(user.plan);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Reject requests when the user's plan is below `min`.
 * Use after `authMiddleware` + preferably `attachUserPlan` (loads plan if missing).
 */
export function requireMinPlan(min: PlanTier) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.plan) {
        if (!req.userId) {
          res.status(401).json({
            success: false,
            message: "Unauthorized",
            code: "UNAUTHORIZED",
          });
          return;
        }
        const user = await prisma.user.findUnique({
          where: { id: req.userId },
          select: { plan: true },
        });
        req.plan = normalizePlan(user?.plan);
      }

      const plan = req.plan ?? "FREE";
      if (!planMeetsMinimum(plan, min)) {
        res.status(403).json({
          success: false,
          message:
            "This feature is not available on your current plan. Upgrade in Billing to unlock it.",
          code: "PLAN_REQUIRED",
        });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

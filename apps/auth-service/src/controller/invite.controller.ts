import {
  asyncHandler,
  castifyResponse,
  castifyError,
  zodErrors,
  STATUS_CODE,
  STATUS_MSG,
} from "@castify/common";
import { prisma } from "@castify/db";
import type { Request, Response } from "express";
import {
  createInviteSchema,
  redeemInviteSchema,
} from "../access/invite.schema";
import {
  createStreamInvite,
  listStreamInvites,
  revokeStreamInvite,
  redeemInviteCode,
} from "../access/invite.service";

export const createInvite = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const streamId = req.params["streamId"] as string;

  const stream = await prisma.stream.findFirst({
    where: { id: streamId, userId },
    select: { id: true },
  });
  if (!stream) {
    return castifyError(res, "Stream not found", STATUS_CODE.NOT_FOUND);
  }

  const parsed = createInviteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return castifyError(
      res,
      STATUS_MSG.VALIDATION_FAILED,
      STATUS_CODE.UNPROCESSABLE,
      zodErrors(parsed.error)
    );
  }

  const result = await createStreamInvite(streamId, userId, parsed.data);
  return castifyResponse(
    res,
    result,
    "Invite created — copy the code now; it will not be shown again",
    STATUS_CODE.CREATED
  );
});

export const listInvites = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const streamId = req.params["streamId"] as string;

  const stream = await prisma.stream.findFirst({
    where: { id: streamId, userId },
    select: { id: true },
  });
  if (!stream) {
    return castifyError(res, "Stream not found", STATUS_CODE.NOT_FOUND);
  }

  const invites = await listStreamInvites(streamId, userId);
  return castifyResponse(res, invites, STATUS_MSG.OK);
});

export const revokeInvite = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const streamId = req.params["streamId"] as string;
  const inviteId = req.params["inviteId"] as string;

  const updated = await revokeStreamInvite(inviteId, streamId, userId);
  if (!updated) {
    return castifyError(res, "Invite not found", STATUS_CODE.NOT_FOUND);
  }
  return castifyResponse(res, { id: updated.id, revokedAt: updated.revokedAt }, "Invite revoked");
});

export const redeemInvite = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const parsed = redeemInviteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return castifyError(
      res,
      STATUS_MSG.VALIDATION_FAILED,
      STATUS_CODE.UNPROCESSABLE,
      zodErrors(parsed.error)
    );
  }

  const result = await redeemInviteCode(userId, parsed.data.code);
  if (!result.ok) {
    return castifyError(res, result.reason, STATUS_CODE.FORBIDDEN);
  }

  return castifyResponse(
    res,
    {
      streamId: result.streamId,
      alreadyHadAccess: result.alreadyHadAccess,
      watchPath: `/watch/${result.streamId}`,
    },
    result.alreadyHadAccess ? "You already have access" : "Access granted"
  );
});

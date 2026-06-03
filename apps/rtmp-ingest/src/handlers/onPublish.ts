import type { Request, Response } from "express";
import type { RtmpCallbackBody } from "@castify/types";
import { logger, config } from "../config.ts";
import { authService } from "../services/authService.ts";
import { kafkaService } from "../services/kafkaService.ts";
import type { ActiveStreamState } from "../types.ts";

export const activeStreams = new Map<string, ActiveStreamState>();

export async function onPublishHandler(req: Request, res: Response) {
  const body = req.body as Partial<RtmpCallbackBody>;
  const {
    name: streamKey,
    app,
    addr: clientIp,
    clientid: nginxClientId,
  } = body;

  logger.info(
    { app, clientIp, nginxClientId, hasKey: !!streamKey },
    "on_publish callback received"
  );

  if (app !== config.NGINX_RTMP_APP) {
    logger.warn(
      { app, expected: config.NGINX_RTMP_APP },
      "Unknown RTMP app — rejecting"
    );
    return res.status(403).send("forbidden");
  }

  if (!streamKey) {
    logger.warn("on_publish called without a stream key — rejecting");
    return res.status(400).send("bad request");
  }

  const validation = await authService.validateStreamKey(streamKey);

  if (!validation.valid) {
    logger.warn(
      {
        streamKey: `${streamKey.slice(0, 8)}…`,
        reason: validation.error,
        clientIp,
      },
      "Stream key invalid — rejecting RTMP connection"
    );
    return res.status(401).send("unauthorized");
  }

  const { streamId, userId } = validation;

  activeStreams.set(streamKey, {
    streamId: streamId!,
    userId: userId!,
    startedAt: new Date(),
  });

  await kafkaService.publishStreamStarted({
    streamId: streamId!,
    userId: userId!,
    streamKey,
    startedAt: new Date().toISOString(),
    clientIp: clientIp?.toString(),
    nginxClientId: nginxClientId?.toString(),
  });

  logger.info(
    {
      streamId,
      userId,
      username: validation.username,
      streamKey: `${streamKey.slice(0, 8)}…`,
    },
    "✅ Stream started — RTMP connection allowed"
  );

  return res.status(200).send("ok");
}

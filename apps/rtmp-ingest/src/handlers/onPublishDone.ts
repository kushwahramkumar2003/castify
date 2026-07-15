import type { Request, Response } from "express";
import type { RtmpCallbackBody } from "@castify/types";
import { logger, config } from "../config.ts";
import { authService } from "../services/authService.ts";
import { kafkaService } from "../services/kafkaService.ts";
import { activeStreams } from "./onPublish.ts";

export async function onPublishDoneHandler(req: Request, res: Response) {
  const body = req.body as Partial<RtmpCallbackBody>;
  const { name: streamKey, addr: clientIp } = body;

  logger.info({ clientIp }, "on_publish_done callback received");

  if (!streamKey) {
    logger.warn("on_publish_done called without a stream key");
    return res.status(200).send("ok");
  }

  const activeStream = activeStreams.get(streamKey);

  if (!activeStream) {
    logger.warn(
      { streamKey: `${streamKey.slice(0, 8)}…` },
      "on_publish_done for unknown stream — was rejected or already cleaned up"
    );
    return res.status(200).send("ok");
  }

  const { streamId, userId, startedAt } = activeStream;
  const endedAt = new Date();
  const durationSeconds = Math.round(
    (endedAt.getTime() - startedAt.getTime()) / 1_000
  );

  activeStreams.delete(streamKey);
  authService.evictStreamKey(streamKey);

  // Mark offline only — session stays open so OBS can reconnect with the same key
  try {
    const offlineUrl = `${config.AUTH_SERVICE_URL}/api/v1/internal/streams/${streamId}/offline`;
    await fetch(offlineUrl, {
      method: "POST",
      headers: { "X-Internal-Secret": config.INTERNAL_SECRET },
    });
    logger.info({ streamId }, "Notified auth-service of stream offline");
  } catch (err) {
    logger.error({ err, streamId }, "Failed to call auth-service streamOffline endpoint");
  }

  await kafkaService.publishStreamEnded({
    streamId,
    userId,
    streamKey,
    endedAt: endedAt.toISOString(),
    durationSeconds,
  });

  logger.info(
    { streamId, userId, durationSeconds },
    "✅ Publisher disconnected — stream marked offline, keys remain valid"
  );

  return res.status(200).send("ok");
}

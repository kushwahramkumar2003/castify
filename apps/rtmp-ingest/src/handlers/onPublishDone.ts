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

  // Fully end the session (same as creator "End Broadcast" in Studio):
  // revoke keys, set endedAt, create VOD pointer, stop transcoder via Kafka.
  try {
    const endUrl = `${config.AUTH_SERVICE_URL}/api/v1/internal/streams/${streamId}/end`;
    await fetch(endUrl, {
      method: "POST",
      headers: { "X-Internal-Secret": config.INTERNAL_SECRET },
    });
    logger.info({ streamId }, "Notified auth-service of stream end (OBS stopped)");
  } catch (err) {
    logger.error({ err, streamId }, "Failed to call auth-service endStream endpoint");
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
    "✅ Publisher disconnected — stream ended (keys revoked)"
  );

  return res.status(200).send("ok");
}

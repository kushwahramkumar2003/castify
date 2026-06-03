import type { Request, Response } from "express";
import type { RtmpCallbackBody } from "@castify/types";
import { logger, config } from "../config.ts";

export async function onPlayHandler(req: Request, res: Response) {
  const body = req.body as Partial<RtmpCallbackBody>;
  const { name: streamKey, addr: clientIp, clientid, app } = body;

  logger.info(
    {
      app,
      clientIp,
      clientid,
      streamKey: streamKey ? `${streamKey.slice(0, 8)}…` : "unknown",
    },
    "on_play callback — RTMP viewer connecting"
  );

  if (config.NODE_ENV === "production") {
    logger.warn(
      { clientIp },
      "Direct RTMP playback in production — viewers should use HLS"
    );
  }

  return res.status(200).send("ok");
}

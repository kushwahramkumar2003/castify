import { Router, type Request, type Response } from "express";
import { activeStreams } from "../handlers/onPublish.ts";

export const healthRouter = Router();

healthRouter.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "rtmp-ingest",
    timestamp: new Date().toISOString(),
    activeStreams: activeStreams.size,
    activeStreamKeys: [...activeStreams.keys()].map((k) => `${k.slice(0, 8)}…`),
  });
});

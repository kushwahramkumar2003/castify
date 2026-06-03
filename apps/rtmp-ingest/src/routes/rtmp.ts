import { Router } from "express";
import { onPublishHandler } from "../handlers/onPublish.ts";
import { onPublishDoneHandler } from "../handlers/onPublishDone.ts";
import { onPlayHandler } from "../handlers/onPlay.ts";

export const rtmpRouter = Router();

rtmpRouter.post("/on-publish", onPublishHandler);
rtmpRouter.post("/on-publish-done", onPublishDoneHandler);
rtmpRouter.post("/on-play", onPlayHandler);

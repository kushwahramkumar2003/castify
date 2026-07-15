import { config } from "./config.ts";
import { logger } from "./logger.ts";
import {
  uploadSegment,
  uploadPlaylist,
  uploadPlaylistFromDisk,
} from "./storage.ts";

export async function processSegment(event: {
  streamKey: string;
  quality: string;
  segmentIndex: number;
  localSegmentPath: string;
  localPlaylistPath: string;
  segmentKey: string;
  isMaster: boolean;
  masterPlaylist?: string;
  discontinuity?: boolean;
}): Promise<void> {
  try {
    if (event.isMaster && event.masterPlaylist) {
      await uploadPlaylist(event.masterPlaylist, event.segmentKey);
      logger.info(
        { streamKey: `${event.streamKey.slice(0, 8)}…`, key: event.segmentKey },
        "Master playlist uploaded"
      );
      return;
    }
    await uploadSegment(event.localSegmentPath, event.segmentKey);
    const playlistKey = `live/${event.streamKey}/${event.quality}/index.m3u8`;
    // Merge with any prior playlist so OBS stop/start keeps multi-clip history.
    // discontinuity=true on first segment after OBS reconnect inserts
    // #EXT-X-DISCONTINUITY so players can stitch clips with reset timestamps.
    await uploadPlaylistFromDisk(event.localPlaylistPath, playlistKey, {
      merge: true,
      finalize: false,
      discontinuity: event.discontinuity === true,
    });

    logger.info(
      {
        streamKey: `${event.streamKey.slice(0, 8)}…`,
        quality: event.quality,
        index: event.segmentIndex,
        discontinuity: Boolean(event.discontinuity),
      },
      "Segment + merged playlist uploaded"
    );
  } catch (err) {
    logger.error(
      {
        err,
        streamKey: `${event.streamKey.slice(0, 8)}…`,
        key: event.segmentKey,
      },
      "Failed to process segment — will retry on next event"
    );
  }
}

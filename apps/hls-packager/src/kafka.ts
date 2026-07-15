import { KafkaConsumer } from "@castify/kafka";
import type { VideoSegmentReadyEvent } from "@castify/types";
import { config } from "./config.ts";
import { logger } from "./logger.ts";
import { processSegment } from "./processor.ts";

let consumer: KafkaConsumer | null = null;

export async function connectConsumer(): Promise<void> {
  consumer = new KafkaConsumer({
    clientId: `${config.KAFKA_CLIENT_ID}-consumer`,
    brokers: config.KAFKA_BROKERS.split(",").map((b) => b.trim()),
    groupId: config.KAFKA_GROUP_ID,
  });

  await consumer.connect();

  await consumer.subscribe(
    config.KAFKA_TOPIC_VIDEO_SEGMENT_READY,
    async (msg) => {
      if (!msg.value) return;

      let event: VideoSegmentReadyEvent;
      try {
        event = JSON.parse(msg.value.toString()) as VideoSegmentReadyEvent;
      } catch (err) {
        logger.error({ err }, "Failed to parse video.segment.ready event");
        return;
      }

      await processSegment({
        streamKey: event.streamKey,
        quality: event.quality,
        segmentIndex: event.segmentIndex,
        localSegmentPath: event.localSegmentPath,
        localPlaylistPath: event.localPlaylistPath,
        segmentKey: event.segmentKey,
        isMaster: event.isMaster ?? false,
        masterPlaylist: event.masterPlaylist,
        discontinuity: event.discontinuity === true,
      });
    }
  );

  await consumer.run();

  logger.info(
    {
      topic: config.KAFKA_TOPIC_VIDEO_SEGMENT_READY,
      groupId: config.KAFKA_GROUP_ID,
    },
    "Kafka consumer connected and subscribed"
  );
}

export async function disconnectConsumer(): Promise<void> {
  await consumer?.disconnect();
}

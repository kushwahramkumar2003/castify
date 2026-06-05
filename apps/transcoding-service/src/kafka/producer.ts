import { KafkaProducer } from "@castify/kafka";
import type { VideoSegmentReadyEvent } from "@castify/types";
import { config } from "../config.ts";
import { logger } from "../logger.ts";

// =============================================================================
// Kafka producer — transcoding-service produces one event type
// =============================================================================
// Topic: video.segment.ready
// Published after each HLS segment is successfully uploaded to MinIO.
// Consumers: hls-packager, analytics-service (segment-level metrics)
//
// Message key = streamId (ensures ordered delivery per stream)
// =============================================================================

let producer: KafkaProducer | null = null;

export async function connectProducer(): Promise<void> {
  producer = new KafkaProducer({
    clientId: `${config.KAFKA_CLIENT_ID}-producer`,
    brokers: config.KAFKA_BROKERS.split(",").map((b) => b.trim()),
    allowAutoTopicCreation: true,
  });
  await producer.connect();
  logger.info("Kafka producer connected");
}

export async function disconnectProducer(): Promise<void> {
  await producer?.disconnect();
}

export async function publishSegmentReady(event: VideoSegmentReadyEvent): Promise<void> {
  if (!producer?.isConnected()) {
    logger.warn({ topic: config.KAFKA_TOPIC_VIDEO_SEGMENT_READY }, "Producer not connected — dropping segment event");
    return;
  }

  try {
    await producer.publish(config.KAFKA_TOPIC_VIDEO_SEGMENT_READY, [
      {
        key: event.streamId,
        value: event,
        headers: {
          "event-type": "video.segment.ready",
          "source-service": "transcoding-service",
          "schema-version": "1",
          "instance-id": config.INSTANCE_ID,
        },
      },
    ]);
  } catch (err) {
    // Don't let a Kafka publish failure crash the transcoding — segments are
    // already in MinIO; the event is informational for downstream consumers.
    logger.error({ err, event: { streamId: event.streamId, quality: event.quality } }, "Failed to publish segment ready event");
  }
}

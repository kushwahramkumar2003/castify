import { KafkaConsumer } from "@castify/kafka";
import type { StreamStartedEvent, StreamEndedEvent } from "@castify/types";
import { config } from "../config.ts";
import { logger } from "../logger.ts";
import type { WorkerPool } from "../worker/workerPool.ts";

// =============================================================================
// Kafka consumer — subscribes to stream lifecycle events
// =============================================================================
//
// Topics consumed:
//   stream.started  → pool.addStream()    → spawn FFmpeg
//   stream.ended    → pool.removeStream() → stop FFmpeg gracefully
//
// Consumer group: "transcoding-service-group"
// Key insight: ALL instances of transcoding-service share this group.
// Kafka distributes partition assignments across instances automatically.
// Each partition's messages go to exactly one instance at a time.
//
// Since stream events are keyed by streamId, the same instance always handles
// both stream.started and stream.ended for the same stream (consistent hashing
// to partition, same consumer on that partition).
// This is why the in-memory WorkerPool works — no Redis needed in Phase 1.
// =============================================================================

let consumer: KafkaConsumer | null = null;

export async function connectConsumer(pool: WorkerPool): Promise<void> {
  // Unique clientId per process so multiple local instances are easy to spot
  // in Kafka logs; shared groupId is what enables horizontal scale-out.
  consumer = new KafkaConsumer({
    clientId: `${config.KAFKA_CLIENT_ID}-${config.INSTANCE_ID}`,
    brokers: config.KAFKA_BROKERS.split(",").map((b) => b.trim()),
    groupId: config.KAFKA_GROUP_ID,
  });

  await consumer.connect();

  // ── stream.started ─────────────────────────────────────────────────────────
  await consumer.subscribe(config.KAFKA_TOPIC_STREAM_STARTED, async (msg) => {
    if (!msg.value) return;

    let event: StreamStartedEvent;
    try {
      event = JSON.parse(msg.value.toString()) as StreamStartedEvent;
    } catch (err) {
      logger.error({ err, raw: msg.value.toString().slice(0, 200) }, "Failed to parse stream.started event");
      return;
    }

    logger.info(
      { streamId: event.streamId, streamKey: `${event.streamKey.slice(0, 8)}…` },
      "Consumed stream.started"
    );

    await pool.addStream(event);
  });

  // ── stream.ended ───────────────────────────────────────────────────────────
  await consumer.subscribe(config.KAFKA_TOPIC_STREAM_ENDED, async (msg) => {
    if (!msg.value) return;

    let event: StreamEndedEvent;
    try {
      event = JSON.parse(msg.value.toString()) as StreamEndedEvent;
    } catch (err) {
      logger.error({ err }, "Failed to parse stream.ended event");
      return;
    }

    logger.info(
      { streamId: event.streamId, durationSeconds: event.durationSeconds },
      "Consumed stream.ended"
    );

    await pool.removeStream(event.streamKey);
  });

  // ── Start the consumer loop (MUST be called after all subscribe() calls) ──
  await consumer.run();

  logger.info(
    {
      topics: [config.KAFKA_TOPIC_STREAM_STARTED, config.KAFKA_TOPIC_STREAM_ENDED],
      groupId: config.KAFKA_GROUP_ID,
    },
    "Kafka consumer connected and subscribed"
  );
}

export async function disconnectConsumer(): Promise<void> {
  await consumer?.disconnect();
}

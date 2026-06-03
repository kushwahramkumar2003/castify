import { KafkaProducer } from "@castify/kafka";
import type { StreamStartedEvent, StreamEndedEvent } from "@castify/types";
import { config, logger } from "../config.ts";

class KafkaService {
  private readonly producer: KafkaProducer;

  constructor() {
    this.producer = new KafkaProducer({
      clientId: config.KAFKA_CLIENT_ID,
      brokers: config.KAFKA_BROKERS.split(",").map((b) => b.trim()),
      allowAutoTopicCreation: true,
    });
  }

  async connect(): Promise<void> {
    await this.producer.connect();
    logger.info(
      { brokers: config.KAFKA_BROKERS },
      "Kafka producer connected"
    );
  }

  async disconnect(): Promise<void> {
    if (!this.producer.isConnected()) return;
    await this.producer.disconnect();
    logger.info("Kafka producer disconnected");
  }

  async publishStreamStarted(event: StreamStartedEvent): Promise<void> {
    try {
      await this.producer.publish(config.KAFKA_TOPIC_STREAM_STARTED, [
        {
          key: event.streamId,
          value: event,
          headers: {
            "event-type": "stream.started",
            "source-service": "rtmp-ingest",
            "schema-version": "1",
          },
        },
      ]);

      logger.info(
        { streamId: event.streamId, userId: event.userId, topic: config.KAFKA_TOPIC_STREAM_STARTED },
        "Published stream.started"
      );
    } catch (err) {
      logger.error({ err, topic: config.KAFKA_TOPIC_STREAM_STARTED }, "Failed to publish stream.started");
    }
  }

  async publishStreamEnded(event: StreamEndedEvent): Promise<void> {
    try {
      await this.producer.publish(config.KAFKA_TOPIC_STREAM_ENDED, [
        {
          key: event.streamId,
          value: event,
          headers: {
            "event-type": "stream.ended",
            "source-service": "rtmp-ingest",
            "schema-version": "1",
          },
        },
      ]);

      logger.info(
        {
          streamId: event.streamId,
          userId: event.userId,
          durationSeconds: event.durationSeconds,
          topic: config.KAFKA_TOPIC_STREAM_ENDED,
        },
        "Published stream.ended"
      );
    } catch (err) {
      logger.error({ err, topic: config.KAFKA_TOPIC_STREAM_ENDED }, "Failed to publish stream.ended");
    }
  }
}

export const kafkaService = new KafkaService();

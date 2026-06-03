import { Kafka, type Producer } from "kafkajs";
import type { KafkaProducerOptions, KafkaMessage } from "./types.ts";

export class KafkaProducer {
  private readonly kafka: Kafka;
  private readonly producer: Producer;
  private connected = false;

  constructor(options: KafkaProducerOptions) {
    this.kafka = new Kafka({
      clientId: options.clientId,
      brokers: options.brokers,
      retry: {
        initialRetryTime: 300,
        retries: 8,
        multiplier: 2,
        maxRetryTime: 30_000,
      },
      logCreator: () => () => {},
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: options.allowAutoTopicCreation ?? true,
    });
  }

  async connect(): Promise<void> {
    await this.producer.connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.producer.disconnect();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async publish(
    topic: string,
    messages: KafkaMessage[],
  ): Promise<void> {
    if (!this.connected) {
      throw new Error(
        `Kafka producer not connected — cannot publish to ${topic}`,
      );
    }

    await this.producer.send({
      topic,
      messages: messages.map((m) => ({
        key: m.key,
        value: JSON.stringify(m.value),
        headers: m.headers,
      })),
    });
  }
}

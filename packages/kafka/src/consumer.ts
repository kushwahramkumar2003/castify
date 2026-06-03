import { Kafka, type Consumer } from "kafkajs";
import type { KafkaConsumerOptions, MessageHandler } from "./types.ts";

export class KafkaConsumer {
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;

  constructor(options: KafkaConsumerOptions) {
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

    this.consumer = this.kafka.consumer({
      groupId: options.groupId,
    });
  }

  async connect(): Promise<void> {
    await this.consumer.connect();
  }

  async disconnect(): Promise<void> {
    await this.consumer.disconnect();
  }

  async subscribe(
    topic: string,
    handler: MessageHandler,
  ): Promise<void> {
    await this.consumer.subscribe({ topic, fromBeginning: false });

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        await handler({
          key: message.key,
          value: message.value,
          headers: Object.fromEntries(
            Object.entries(message.headers ?? {}).map(([k, v]) => [k, String(v ?? "")]),
          ),
          topic,
          partition,
          offset: message.offset,
        });
      },
    });
  }
}

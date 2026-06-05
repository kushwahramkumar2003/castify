import { Kafka, type Consumer } from "kafkajs";
import type { KafkaConsumerOptions, MessageHandler } from "./types.ts";

export class KafkaConsumer {
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;

  // topic → handler (populated before run() is called)
  private readonly handlers = new Map<string, MessageHandler>();
  private running = false;

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

  // ---------------------------------------------------------------------------
  // subscribe() — register a topic + handler.
  //
  // KafkaJS rule: you MUST call consumer.subscribe() for ALL topics BEFORE
  // calling consumer.run(). Calling subscribe() after run() throws:
  //   "Cannot subscribe to topic while consumer is running"
  //
  // This method registers the topic+handler without calling run().
  // Call run() explicitly after all subscriptions are registered.
  // ---------------------------------------------------------------------------
  async subscribe(
    topic: string,
    handler: MessageHandler,
  ): Promise<void> {
    if (this.running) {
      throw new Error(
        `KafkaConsumer: cannot subscribe to "${topic}" — consumer is already running. ` +
        `Subscribe to all topics BEFORE calling run().`
      );
    }
    this.handlers.set(topic, handler);
    await this.consumer.subscribe({ topic, fromBeginning: false });
  }

  // ---------------------------------------------------------------------------
  // run() — start the consumer loop.
  // Call this ONCE after all topics have been subscribed.
  // Messages are routed to the correct handler by topic name.
  // ---------------------------------------------------------------------------
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const handler = this.handlers.get(topic);
        if (!handler) return;

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

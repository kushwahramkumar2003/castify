import { Kafka, type Producer, type Consumer } from "kafkajs";

export interface KafkaClientOptions {
  clientId: string;
  brokers: string[];
}

export interface KafkaProducerOptions extends KafkaClientOptions {
  allowAutoTopicCreation?: boolean;
}

export interface KafkaConsumerOptions extends KafkaClientOptions {
  groupId: string;
}

export interface KafkaMessage {
  key: string;
  value: unknown;
  headers?: Record<string, string>;
}

export interface ReceivedMessage {
  key: Buffer | null;
  value: Buffer | null;
  headers: Record<string, string>;
  topic: string;
  partition: number;
  offset: string;
}

export type MessageHandler = (message: ReceivedMessage) => Promise<void>;

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka: Kafka;
  private producer: Producer;
  private consumers: Map<string, Consumer> = new Map();

  constructor(private readonly configService: ConfigService) {
    const brokers = this.configService
      .get<string>('KAFKA_BROKERS', 'localhost:9092')
      .split(',');

    this.kafka = new Kafka({
      clientId: this.configService.get('KAFKA_CLIENT_ID', 'invoicing-pipeline'),
      brokers,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000,
    });
  }

  async onModuleInit() {
    await this.producer.connect();
    this.logger.log('Kafka producer connected');
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
    this.logger.log('Kafka producer disconnected');

    // Disconnect all consumers
    for (const [groupId, consumer] of this.consumers.entries()) {
      await consumer.disconnect();
      this.logger.log(`Kafka consumer disconnected: ${groupId}`);
    }
  }

  async sendMessage(topic: string, message: unknown): Promise<void> {
    try {
      await this.producer.send({
        topic,
        messages: [
          {
            value: JSON.stringify(message),
            timestamp: Date.now().toString(),
          },
        ],
      });
      this.logger.debug(`Message sent to topic ${topic}`);
    } catch (error) {
      this.logger.error(`Failed to send message to topic ${topic}`, error);
      throw error;
    }
  }

  async sendMessages(topic: string, messages: unknown[]): Promise<void> {
    try {
      await this.producer.send({
        topic,
        messages: messages.map((message) => ({
          value: JSON.stringify(message),
          timestamp: Date.now().toString(),
        })),
      });
      this.logger.debug(`${messages.length} messages sent to topic ${topic}`);
    } catch (error) {
      this.logger.error(`Failed to send messages to topic ${topic}`, error);
      throw error;
    }
  }

  async createConsumer(
    groupId: string,
    topics: string[],
    handler: (payload: EachMessagePayload) => Promise<void>,
  ): Promise<void> {
    if (this.consumers.has(groupId)) {
      this.logger.warn(`Consumer group ${groupId} already exists`);
      return;
    }

    const consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    await consumer.connect();
    await consumer.subscribe({
      topics,
      fromBeginning: false,
    });

    await consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        try {
          await handler(payload);
        } catch (error) {
          this.logger.error(
            `Error processing message from topic ${payload.topic}`,
            error,
          );
          // Don't throw - let consumer continue processing
        }
      },
    });

    this.consumers.set(groupId, consumer);
    this.logger.log(`Kafka consumer created for group: ${groupId}`);
  }

  async disconnectConsumer(groupId: string): Promise<void> {
    const consumer = this.consumers.get(groupId);
    if (consumer) {
      await consumer.disconnect();
      this.consumers.delete(groupId);
      this.logger.log(`Consumer ${groupId} disconnected`);
    }
  }
}

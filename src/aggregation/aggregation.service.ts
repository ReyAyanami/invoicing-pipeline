import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { AggregatedUsage } from './entities/aggregated-usage.entity';
import { KAFKA_TOPICS } from '../kafka/constants';

/**
 * Aggregation Service
 *
 * Consumes telemetry events from Kafka and aggregates them into
 * time-based windows for downstream rating.
 *
 * TODO: Implement proper event-time windowing with watermarks
 * TODO: Handle late arrivals and out-of-order events
 * TODO: Implement different aggregation strategies (count, sum, max, etc.)
 */
@Injectable()
export class AggregationService implements OnModuleInit {
  private readonly logger = new Logger(AggregationService.name);
  private kafka: Kafka;
  private consumer: Consumer;

  constructor(
    @InjectRepository(AggregatedUsage)
    private readonly aggregatedUsageRepository: Repository<AggregatedUsage>,
    private readonly configService: ConfigService,
  ) {
    this.kafka = new Kafka({
      clientId: 'aggregation-service',
      brokers: [
        this.configService.get<string>('KAFKA_BROKER') || 'localhost:9092',
      ],
    });

    this.consumer = this.kafka.consumer({
      groupId: 'aggregation-service-group',
    });
  }

  async onModuleInit() {
    await this.startConsumer();
  }

  async onApplicationShutdown() {
    await this.consumer.disconnect();
  }

  private async startConsumer() {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: KAFKA_TOPICS.TELEMETRY_EVENTS,
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });

    this.logger.log(
      `Started consuming from topic: ${KAFKA_TOPICS.TELEMETRY_EVENTS} (group: aggregation-service-group)`,
    );
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { message } = payload;

    try {
      const event = JSON.parse(message.value!.toString()) as {
        eventId: string;
        customerId: string;
        metricType: string;
      };

      this.logger.debug(`Processing event: ${event.eventId}`);

      // TODO: Implement actual aggregation logic
      // For now, just log the event
      this.logger.debug(
        `Event received: ${event.metricType} for customer ${event.customerId}`,
      );

      // Placeholder: would aggregate based on event-time windows
      await this.aggregateEvent(event);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to process message: ${err.message}`, err.stack);
      // TODO: Implement dead letter queue for failed messages
    }
  }

  /**
   * Aggregate an event into time-based windows
   * TODO: Implement event-time windowing logic
   */
  async aggregateEvent(event: { eventId: string }): Promise<void> {
    // Placeholder for aggregation logic
    this.logger.debug(`Would aggregate event: ${event.eventId}`);
    await Promise.resolve(); // Placeholder to satisfy async requirement
  }

  /**
   * Finalize a window when watermark passes
   * TODO: Implement watermark-based window finalization
   */
  async finalizeWindow(
    customerId: string,
    metricType: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<AggregatedUsage> {
    const aggregation = this.aggregatedUsageRepository.create({
      customerId,
      metricType,
      windowStart,
      windowEnd,
      value: '0', // TODO: Calculate from events in window
      unit: 'count',
      eventCount: 0, // TODO: Count events in window
      eventIds: [],
      isFinal: true,
      computedAt: new Date(),
    });

    return this.aggregatedUsageRepository.save(aggregation);
  }
}

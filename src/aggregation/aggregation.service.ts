import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { AggregatedUsage } from './entities/aggregated-usage.entity';
import { KAFKA_TOPICS } from '../kafka/constants';
import { KafkaService } from '../kafka/kafka.service';
import { Quantity } from '../common/types';

/**
 * Event structure from Kafka
 */
interface TelemetryEvent {
  eventId: string;
  eventType: string;
  customerId: string;
  eventTime: string; // ISO 8601 timestamp
  metadata: Record<string, unknown>;
}

/**
 * Window key for grouping events
 */
interface WindowKey {
  customerId: string;
  metricType: string;
  windowStart: Date;
}

/**
 * Window state tracking events within a time window
 */
interface WindowState {
  events: TelemetryEvent[];
  eventCount: number;
  lastEventTime: Date;
}

/**
 * Aggregation Service
 *
 * Implements event-time windowing with watermarks:
 * - Groups events into hourly windows based on event_time (not processing time)
 * - Maintains window state in memory
 * - Uses watermarks to determine when windows are complete
 * - Handles late arrivals within allowed lateness window
 * - Aggregates and persists completed windows
 */
@Injectable()
export class AggregationService implements OnModuleInit {
  private readonly logger = new Logger(AggregationService.name);
  private kafka: Kafka;
  private consumer: Consumer;

  // Window configuration
  private readonly WINDOW_SIZE_MS = 60 * 60 * 1000; // 1 hour
  private readonly ALLOWED_LATENESS_MS = 60 * 60 * 1000; // 1 hour late arrival tolerance
  private readonly WATERMARK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

  // No longer using in-memory window state for persistence
  // Watermark timer still used to finalize windows in DB
  private watermarkTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(AggregatedUsage)
    private readonly aggregatedUsageRepository: Repository<AggregatedUsage>,
    private readonly configService: ConfigService,
    private readonly kafkaService: KafkaService,
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
    this.startWatermarkTimer();
  }

  async onApplicationShutdown() {
    if (this.watermarkTimer) {
      clearInterval(this.watermarkTimer);
    }
    await this.consumer.disconnect();
    this.logger.log('Aggregation service shut down');
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
      const event = JSON.parse(message.value!.toString()) as TelemetryEvent;

      this.logger.debug(
        `Processing event: ${event.eventId} at ${event.eventTime}`,
      );

      await this.addEventToWindow(event);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to process message: ${err.message}`, err.stack);
      // TODO: Implement dead letter queue for failed messages
    }
  }

  /**
   * Add event to appropriate time window based on event_time
   */
  private async addEventToWindow(event: TelemetryEvent): Promise<void> {
    const eventTime = new Date(event.eventTime);
    const windowStart = this.getWindowStart(eventTime);
    const windowEnd = new Date(windowStart.getTime() + this.WINDOW_SIZE_MS);

    // Check if event is too late (beyond allowed lateness)
    const now = new Date();
    const watermark = new Date(now.getTime() - this.ALLOWED_LATENESS_MS);

    if (windowStart < watermark) {
      this.logger.warn(
        `Event ${event.eventId} arrived too late. Window: ${windowStart.toISOString()}, Watermark: ${watermark.toISOString()}`,
      );

      // REDIRECT TO LATE EVENTS TOPIC
      await this.kafkaService.sendMessage(KAFKA_TOPICS.LATE_EVENTS, {
        ...event,
        receivedAt: now.toISOString(),
        watermark: watermark.toISOString(),
      });
      return;
    }

    // Determine metric type and get unit
    const metricType = this.getMetricType(event);
    const unit = this.getUnit(metricType);

    // Fetch existing non-finalized aggregation or create new one
    let aggregation = await this.aggregatedUsageRepository.findOne({
      where: {
        customerId: event.customerId,
        metricType,
        windowStart,
        isFinal: false,
      },
    });

    if (!aggregation) {
      aggregation = this.aggregatedUsageRepository.create({
        customerId: event.customerId,
        metricType,
        windowStart,
        windowEnd,
        value: Quantity.zero(),
        unit,
        eventCount: 0,
        eventIds: [],
        isFinal: false,
        version: 1,
        computedAt: new Date(),
      });
    }

    // Apply aggregation strategy
    aggregation.value = this.applyAggregationStrategy(
      aggregation.value,
      event,
      metricType,
    );
    aggregation.eventCount++;
    aggregation.eventIds.push(event.eventId);
    aggregation.computedAt = new Date();

    await this.aggregatedUsageRepository.save(aggregation);

    this.logger.debug(
      `Updated aggregation for ${metricType} (ID: ${aggregation.aggregationId}): Value=${aggregation.value}, Count=${aggregation.eventCount}`,
    );
  }

  /**
   * Start periodic watermark timer to finalize completed windows
   */
  private startWatermarkTimer(): void {
    this.watermarkTimer = setInterval(() => {
      void this.advanceWatermark();
    }, this.WATERMARK_INTERVAL_MS);

    this.logger.log(
      `Started watermark timer (interval: ${this.WATERMARK_INTERVAL_MS / 1000}s, allowed lateness: ${this.ALLOWED_LATENESS_MS / 1000}s)`,
    );
  }

  /**
   * Advance watermark and finalize any completed windows in the database
   */
  private async advanceWatermark(): Promise<void> {
    const now = new Date();
    const watermark = new Date(now.getTime() - this.ALLOWED_LATENESS_MS);

    this.logger.debug(`Advancing watermark to: ${watermark.toISOString()}`);

    // Find all non-finalized windows that have passed the watermark
    const completedWindows = await this.aggregatedUsageRepository
      .createQueryBuilder('usage')
      .where('usage.is_final = :isFinal', { isFinal: false })
      .andWhere('usage.window_end <= :watermark', { watermark })
      .getMany();

    if (completedWindows.length === 0) return;

    // Finalize each completed window
    for (const aggregation of completedWindows) {
      try {
        await this.finalizeAggregation(aggregation);
      } catch (error) {
        const err = error as Error;
        this.logger.error(
          `Failed to finalize aggregation ${aggregation.aggregationId}: ${err.message}`,
        );
      }
    }

    this.logger.log(`Finalized ${completedWindows.length} windows`);
  }

  /**
   * Finalize an aggregation by setting isFinal and publishing to Kafka
   */
  private async finalizeAggregation(
    aggregation: AggregatedUsage,
  ): Promise<void> {
    aggregation.isFinal = true;
    aggregation.computedAt = new Date();

    const saved = await this.aggregatedUsageRepository.save(aggregation);

    // Publish to Kafka for downstream rating
    await this.kafkaService.sendMessage(KAFKA_TOPICS.AGGREGATED_USAGE, {
      aggregationId: saved.aggregationId,
      customerId: saved.customerId,
      metricType: saved.metricType,
      windowStart: saved.windowStart.toISOString(),
      windowEnd: saved.windowEnd.toISOString(),
      value: saved.value,
      unit: saved.unit,
      eventCount: saved.eventCount,
      isFinal: saved.isFinal,
    });

    this.logger.log(
      `Published final aggregation ${saved.aggregationId} (${saved.metricType}): ${saved.value} ${saved.unit}`,
    );
  }

  /**
   * Get window start time by rounding down to nearest hour
   */
  private getWindowStart(eventTime: Date): Date {
    const timestamp = eventTime.getTime();
    const roundedTimestamp =
      Math.floor(timestamp / this.WINDOW_SIZE_MS) * this.WINDOW_SIZE_MS;
    return new Date(roundedTimestamp);
  }



  /**
   * Determine metric type from event
   * In real system, this would inspect event metadata
   */
  private getMetricType(event: TelemetryEvent): string {
    // For now, use event type as metric type
    // In production, you might have:
    // - api_calls
    // - storage_gb_hours
    // - bandwidth_mb
    // - compute_hours
    return event.eventType;
  }

  /**
   * Apply aggregation strategy to current value
   */
  private applyAggregationStrategy(
    currentValue: Quantity,
    event: TelemetryEvent,
    metricType: string,
  ): Quantity {
    const eventValue = event.metadata?.value ? String(event.metadata.value) : '1';

    // Different strategies per metric type:
    // - api_calls, compute_hours: SUM (incremental)
    // - storage_gb: MAX (peak usage in window)
    // Default is COUNT (adding 1)

    switch (metricType) {
      case 'api_calls':
      case 'bandwidth_mb':
      case 'compute_hours':
        return Quantity.add(currentValue, eventValue);

      case 'storage_gb_peak':
      case 'concurrent_users_max':
        return Quantity.max(currentValue, eventValue);

      default:
        // Default to increment by 1 (COUNT)
        return Quantity.add(currentValue, '1');
    }
  }

  /**
   * Get unit for metric type
   */
  private getUnit(metricType: string): string {
    // Map metric types to units
    const unitMap: Record<string, string> = {
      api_calls: 'count',
      storage_gb_hours: 'gb_hours',
      bandwidth_mb: 'megabytes',
      compute_hours: 'hours',
    };

    return unitMap[metricType] || 'count';
  }
}

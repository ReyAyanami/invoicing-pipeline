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

  // In-memory window state
  private readonly windows = new Map<string, WindowState>();
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
      eachMessage: (payload: EachMessagePayload) => {
        this.handleMessage(payload);
        return Promise.resolve();
      },
    });

    this.logger.log(
      `Started consuming from topic: ${KAFKA_TOPICS.TELEMETRY_EVENTS} (group: aggregation-service-group)`,
    );
  }

  private handleMessage(payload: EachMessagePayload): void {
    const { message } = payload;

    try {
      const event = JSON.parse(message.value!.toString()) as TelemetryEvent;

      this.logger.debug(
        `Processing event: ${event.eventId} at ${event.eventTime}`,
      );

      this.addEventToWindow(event);
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to process message: ${err.message}`, err.stack);
      // TODO: Implement dead letter queue for failed messages
    }
  }

  /**
   * Add event to appropriate time window based on event_time
   */
  private addEventToWindow(event: TelemetryEvent): void {
    const eventTime = new Date(event.eventTime);
    const windowStart = this.getWindowStart(eventTime);

    // Check if event is too late (beyond allowed lateness)
    const now = new Date();
    const watermark = new Date(now.getTime() - this.ALLOWED_LATENESS_MS);

    if (windowStart < watermark) {
      this.logger.warn(
        `Event ${event.eventId} arrived too late. Window: ${windowStart.toISOString()}, Watermark: ${watermark.toISOString()}`,
      );
      // TODO: Send to late events topic for re-rating
      return;
    }

    // Determine metric type from event
    const metricType = this.getMetricType(event);

    // Create window key
    const windowKey = this.createWindowKey({
      customerId: event.customerId,
      metricType,
      windowStart,
    });

    // Get or create window state
    let windowState = this.windows.get(windowKey);
    if (!windowState) {
      windowState = {
        events: [],
        eventCount: 0,
        lastEventTime: eventTime,
      };
      this.windows.set(windowKey, windowState);
      this.logger.debug(
        `Created new window: ${windowKey} for ${windowStart.toISOString()}`,
      );
    }

    // Add event to window
    windowState.events.push(event);
    windowState.eventCount++;
    windowState.lastEventTime = eventTime;

    this.logger.debug(
      `Added event ${event.eventId} to window ${windowKey} (${windowState.eventCount} events)`,
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
   * Advance watermark and finalize any completed windows
   */
  private async advanceWatermark(): Promise<void> {
    const now = new Date();
    const watermark = new Date(now.getTime() - this.ALLOWED_LATENESS_MS);

    this.logger.debug(`Advancing watermark to: ${watermark.toISOString()}`);

    const windowsToFinalize: Array<{ key: string; state: WindowState }> = [];

    // Find windows that should be finalized
    for (const [windowKey, windowState] of this.windows.entries()) {
      const { windowStart } = this.parseWindowKey(windowKey);
      const windowEnd = new Date(windowStart.getTime() + this.WINDOW_SIZE_MS);

      // Window is complete if watermark has passed window end
      if (watermark >= windowEnd) {
        windowsToFinalize.push({ key: windowKey, state: windowState });
      }
    }

    // Finalize windows
    for (const { key, state } of windowsToFinalize) {
      try {
        await this.finalizeWindow(key, state);
        this.windows.delete(key);
      } catch (error) {
        const err = error as Error;
        this.logger.error(
          `Failed to finalize window ${key}: ${err.message}`,
          err.stack,
        );
      }
    }

    if (windowsToFinalize.length > 0) {
      this.logger.log(
        `Finalized ${windowsToFinalize.length} windows. Active windows: ${this.windows.size}`,
      );
    }
  }

  /**
   * Finalize a window by aggregating events and persisting
   */
  private async finalizeWindow(
    windowKey: string,
    windowState: WindowState,
  ): Promise<void> {
    const { customerId, metricType, windowStart } =
      this.parseWindowKey(windowKey);
    const windowEnd = new Date(windowStart.getTime() + this.WINDOW_SIZE_MS);

    // Aggregate events in window
    const value = this.aggregateValue(windowState.events, metricType);
    const eventIds = windowState.events.map((e) => e.eventId);

    // Create aggregated usage record
    const aggregation = this.aggregatedUsageRepository.create({
      customerId,
      metricType,
      windowStart,
      windowEnd,
      value,
      unit: this.getUnit(metricType),
      eventCount: windowState.eventCount,
      eventIds,
      isFinal: true,
      version: 1,
      computedAt: new Date(),
    });

    const saved = await this.aggregatedUsageRepository.save(aggregation);

    this.logger.log(
      `Finalized window ${windowKey}: ${value} ${aggregation.unit} from ${windowState.eventCount} events`,
    );

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
   * Create window key for Map storage
   */
  private createWindowKey(key: WindowKey): string {
    return `${key.customerId}:${key.metricType}:${key.windowStart.getTime()}`;
  }

  /**
   * Parse window key back to components
   */
  private parseWindowKey(windowKey: string): WindowKey {
    const parts = windowKey.split(':');
    if (parts.length !== 3) {
      throw new Error(`Invalid window key format: ${windowKey}`);
    }
    return {
      customerId: parts[0],
      metricType: parts[1],
      windowStart: new Date(Number(parts[2])),
    };
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
   * Aggregate value from events in window
   * Different strategies: COUNT, SUM, AVG, MAX, etc.
   */
  private aggregateValue(
    events: TelemetryEvent[],
    _metricType: string,
  ): Quantity {
    // For now, simple COUNT aggregation
    // In production, you'd have different strategies per metric type:
    // - api_calls: COUNT
    // - storage_bytes: SUM(metadata.bytes)
    // - request_duration: AVG(metadata.duration_ms)

    const count = events.length;
    return Quantity.from(count);
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

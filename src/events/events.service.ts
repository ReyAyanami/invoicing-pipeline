import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { TelemetryEvent } from './entities/telemetry-event.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { KafkaService } from '../kafka/kafka.service';
import { KAFKA_TOPICS } from '../kafka/constants';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(TelemetryEvent)
    private readonly telemetryEventRepository: Repository<TelemetryEvent>,
    private readonly kafkaService: KafkaService,
  ) {}

  async ingest(createEventDto: CreateEventDto): Promise<TelemetryEvent> {
    // Check for duplicate eventId
    const existing = await this.telemetryEventRepository.findOne({
      where: { eventId: createEventDto.eventId },
    });

    if (existing) {
      this.logger.warn(`Duplicate eventId: ${createEventDto.eventId}`);
      throw new ConflictException(
        `Event with id ${createEventDto.eventId} already exists`,
      );
    }

    const event = this.telemetryEventRepository.create({
      eventId: createEventDto.eventId,
      eventType: createEventDto.eventType,
      customerId: createEventDto.customerId,
      eventTime: new Date(createEventDto.eventTime),
      ingestionTime: new Date(),
      metadata: createEventDto.metadata || {},
      source: createEventDto.source || null,
    });

    const saved = await this.telemetryEventRepository.save(event);
    this.logger.log(`Ingested event: ${saved.eventId}`);

    // Publish to Kafka for downstream processing
    try {
      await this.kafkaService.sendMessage(KAFKA_TOPICS.TELEMETRY_EVENTS, {
        eventId: saved.eventId,
        eventType: saved.eventType,
        customerId: saved.customerId,
        eventTime: saved.eventTime.toISOString(),
        ingestionTime: saved.ingestionTime.toISOString(),
        metadata: saved.metadata,
        source: saved.source,
      });
      this.logger.debug(`Event published to Kafka: ${saved.eventId}`);
    } catch (error) {
      this.logger.error(
        `Failed to publish event to Kafka: ${saved.eventId}`,
        error,
      );
      // Don't fail the request if Kafka publish fails
      // Event is already persisted to database
    }

    return saved;
  }

  /**
   * Find telemetry events with optional filters
   */
  async findAll(
    customerId?: string,
    eventType?: string,
    limit = 100,
  ): Promise<TelemetryEvent[]> {
    const where: FindOptionsWhere<TelemetryEvent> = {};

    if (customerId) {
      where.customerId = customerId;
    }

    if (eventType) {
      where.eventType = eventType;
    }

    return this.telemetryEventRepository.find({
      where,
      order: { eventTime: 'DESC' },
      take: limit,
    });
  }

  async findOne(eventId: string): Promise<TelemetryEvent | null> {
    return this.telemetryEventRepository.findOne({
      where: { eventId },
    });
  }
}

import { Injectable, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelemetryEvent } from '../database/entities/telemetry-event.entity';
import { CreateEventDto } from './dto/create-event.dto';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(TelemetryEvent)
    private readonly telemetryEventRepository: Repository<TelemetryEvent>,
  ) {}

  async ingest(createEventDto: CreateEventDto): Promise<TelemetryEvent> {
    // Check for duplicate event_id
    const existing = await this.telemetryEventRepository.findOne({
      where: { event_id: createEventDto.event_id },
    });

    if (existing) {
      this.logger.warn(`Duplicate event_id: ${createEventDto.event_id}`);
      throw new ConflictException(
        `Event with id ${createEventDto.event_id} already exists`,
      );
    }

    const event = this.telemetryEventRepository.create({
      event_id: createEventDto.event_id,
      event_type: createEventDto.event_type,
      customer_id: createEventDto.customer_id,
      event_time: new Date(createEventDto.event_time),
      ingestion_time: new Date(),
      metadata: createEventDto.metadata || {},
      source: createEventDto.source || null,
    });

    const saved = await this.telemetryEventRepository.save(event);
    this.logger.log(`Ingested event: ${saved.event_id}`);

    return saved;
  }

  async findAll(
    customerId?: string,
    eventType?: string,
    limit = 100,
  ): Promise<TelemetryEvent[]> {
    const query = this.telemetryEventRepository.createQueryBuilder('event');

    if (customerId) {
      query.andWhere('event.customer_id = :customerId', { customerId });
    }

    if (eventType) {
      query.andWhere('event.event_type = :eventType', { eventType });
    }

    return query.orderBy('event.event_time', 'DESC').limit(limit).getMany();
  }

  async findOne(eventId: string): Promise<TelemetryEvent | null> {
    return this.telemetryEventRepository.findOne({
      where: { event_id: eventId },
    });
  }
}

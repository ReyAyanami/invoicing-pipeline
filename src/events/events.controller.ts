import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async ingest(@Body() createEventDto: CreateEventDto) {
    const event = await this.eventsService.ingest(createEventDto);
    return {
      status: 'accepted',
      eventId: event.eventId,
      ingestionTime: event.ingestionTime,
    };
  }

  @Get()
  async findAll(
    @Query('customer_id') customerId?: string,
    @Query('event_type') eventType?: string,
    @Query('limit') limit?: string,
  ) {
    const events = await this.eventsService.findAll(
      customerId,
      eventType,
      limit ? parseInt(limit, 10) : undefined,
    );
    return {
      count: events.length,
      events,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const event = await this.eventsService.findOne(id);
    if (!event) {
      return {
        status: 'not_found',
        event_id: id,
      };
    }
    return event;
  }
}

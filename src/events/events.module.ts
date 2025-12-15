import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { TelemetryEvent } from '../database/entities/telemetry-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TelemetryEvent])],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}

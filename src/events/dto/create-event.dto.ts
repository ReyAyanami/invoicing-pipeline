import {
  IsString,
  IsUUID,
  IsDateString,
  IsObject,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';

export class CreateEventDto {
  @IsUUID()
  @IsNotEmpty()
  eventId: string;

  @IsString()
  @IsNotEmpty()
  eventType: string;

  @IsUUID()
  @IsNotEmpty()
  customerId: string;

  @IsDateString()
  @IsNotEmpty()
  eventTime: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  source?: string;
}

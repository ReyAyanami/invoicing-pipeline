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
  event_id: string;

  @IsString()
  @IsNotEmpty()
  event_type: string;

  @IsUUID()
  @IsNotEmpty()
  customer_id: string;

  @IsDateString()
  @IsNotEmpty()
  event_time: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  source?: string;
}

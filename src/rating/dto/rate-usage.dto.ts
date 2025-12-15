import { IsUUID, IsString, IsNumber, IsDateString } from 'class-validator';

export class RateUsageDto {
  @IsUUID()
  aggregatedUsageId: string;

  @IsString()
  customerId: string;

  @IsString()
  metricType: string;

  @IsNumber()
  quantity: number;

  @IsDateString()
  effectiveDate: string;
}

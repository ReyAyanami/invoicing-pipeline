import { IsString, IsDateString, IsOptional } from 'class-validator';

export class GenerateInvoiceDto {
  @IsString()
  customerId: string;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  @IsString()
  @IsOptional()
  currency?: string;
}

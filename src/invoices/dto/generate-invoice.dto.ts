import { IsString, IsDateString } from 'class-validator';

export class GenerateInvoiceDto {
  @IsString()
  customerId: string;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;
}

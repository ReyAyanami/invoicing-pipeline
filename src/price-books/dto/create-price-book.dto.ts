import { IsString, IsDateString, IsOptional } from 'class-validator';

export class CreatePriceBookDto {
  @IsString()
  name: string;

  @IsString()
  version: string;

  @IsDateString()
  effectiveFrom: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

import { IsString, IsEnum, IsArray } from 'class-validator';

export interface PriceTier {
  tier: number;
  upTo: number | null;
  unitPrice: number;
  flatFee?: number;
}

export class CreatePriceRuleDto {
  @IsString()
  priceBookId: string;

  @IsString()
  metricType: string;

  @IsEnum(['flat', 'tiered', 'volume', 'committed'])
  pricingModel: 'flat' | 'tiered' | 'volume' | 'committed';

  @IsArray()
  tiers: PriceTier[];

  @IsString()
  unit: string;
}

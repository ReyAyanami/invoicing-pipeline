import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PriceBook } from './price-book.entity';

export interface PriceTier {
  tier: number;
  upTo: number | null;
  unitPrice: number;
  flatFee?: number;
}

@Entity('price_rules')
@Index(['priceBookId'])
@Index(['metricType'])
@Index(['priceBookId', 'metricType'], { unique: true })
export class PriceRule {
  @PrimaryGeneratedColumn('uuid')
  @Column({ name: 'rule_id' })
  ruleId: string;

  @Column({ name: 'price_book_id', type: 'uuid' })
  priceBookId: string;

  @ManyToOne(() => PriceBook)
  @JoinColumn({ name: 'price_book_id' })
  priceBook: PriceBook;

  @Column({ name: 'metric_type', type: 'varchar', length: 100 })
  metricType: string;

  @Column({ name: 'pricing_model', type: 'varchar', length: 20 })
  pricingModel: 'flat' | 'tiered' | 'volume' | 'committed';

  @Column({ type: 'jsonb' })
  tiers: PriceTier[];

  @Column({ type: 'varchar', length: 50 })
  unit: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

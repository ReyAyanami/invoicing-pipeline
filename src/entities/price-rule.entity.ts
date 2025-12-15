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
  up_to: number | null;
  unit_price: number;
  flat_fee?: number;
}

@Entity('price_rules')
@Index(['price_book_id'])
@Index(['metric_type'])
@Index(['price_book_id', 'metric_type'], { unique: true })
export class PriceRule {
  @PrimaryGeneratedColumn('uuid')
  rule_id: string;

  @Column({ type: 'uuid' })
  price_book_id: string;

  @ManyToOne(() => PriceBook)
  @JoinColumn({ name: 'price_book_id' })
  price_book: PriceBook;

  @Column({ type: 'varchar', length: 100 })
  metric_type: string;

  @Column({ type: 'varchar', length: 20 })
  pricing_model: 'flat' | 'tiered' | 'volume' | 'committed';

  @Column({ type: 'jsonb' })
  tiers: PriceTier[];

  @Column({ type: 'varchar', length: 50 })
  unit: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

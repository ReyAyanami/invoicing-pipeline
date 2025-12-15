import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AggregatedUsage } from './aggregated-usage.entity';
import { PriceBook } from './price-book.entity';
import { PriceRule } from './price-rule.entity';

export interface CalculationMetadata {
  formula: string;
  tiers_applied?: Array<{
    tier: number;
    units: number;
    unit_price: number;
    charge: number;
  }>;
  source_events: string[];
  effective_date: string;
  [key: string]: unknown;
}

@Entity('rated_charges')
@Index(['customer_id', 'calculated_at'])
@Index(['aggregation_id'])
@Index(['rerating_job_id'], { where: 'rerating_job_id IS NOT NULL' })
export class RatedCharge {
  @PrimaryGeneratedColumn('uuid')
  charge_id: string;

  @Column({ type: 'uuid' })
  customer_id: string;

  @Column({ type: 'uuid' })
  aggregation_id: string;

  @ManyToOne(() => AggregatedUsage)
  @JoinColumn({ name: 'aggregation_id' })
  aggregation: AggregatedUsage;

  @Column({ type: 'uuid' })
  price_book_id: string;

  @ManyToOne(() => PriceBook)
  @JoinColumn({ name: 'price_book_id' })
  price_book: PriceBook;

  @Column({ type: 'varchar', length: 50 })
  price_version: string;

  @Column({ type: 'uuid' })
  rule_id: string;

  @ManyToOne(() => PriceRule)
  @JoinColumn({ name: 'rule_id' })
  rule: PriceRule;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  quantity: string;

  @Column({ type: 'decimal', precision: 12, scale: 6 })
  unit_price: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: string;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'jsonb' })
  calculation_metadata: CalculationMetadata;

  @Column({ type: 'timestamptz' })
  calculated_at: Date;

  @Column({ type: 'uuid', nullable: true })
  rerating_job_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  supersedes_charge_id: string | null;

  @ManyToOne(() => RatedCharge, { nullable: true })
  @JoinColumn({ name: 'supersedes_charge_id' })
  supersedes_charge: RatedCharge | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

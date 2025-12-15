import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AggregatedUsage } from '../../aggregation/entities/aggregated-usage.entity';
import { PriceBook } from '../../price-books/entities/price-book.entity';
import { PriceRule } from '../../price-books/entities/price-rule.entity';

export interface CalculationMetadata {
  formula: string;
  tiersApplied?: Array<{
    tier: number;
    units: number;
    unitPrice: number;
    charge: number;
  }>;
  sourceEvents: string[];
  effectiveDate: string;
  [key: string]: unknown;
}

@Entity('rated_charges')
@Index(['customerId', 'calculatedAt'])
@Index(['aggregationId'])
@Index(['reratingJobId'], { where: 'rerating_job_id IS NOT NULL' })
export class RatedCharge {
  @PrimaryGeneratedColumn('uuid')
  @Column({ name: 'charge_id' })
  chargeId: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'aggregation_id', type: 'uuid' })
  aggregationId: string;

  @ManyToOne(() => AggregatedUsage)
  @JoinColumn({ name: 'aggregation_id' })
  aggregation: AggregatedUsage;

  @Column({ name: 'price_book_id', type: 'uuid' })
  priceBookId: string;

  @ManyToOne(() => PriceBook)
  @JoinColumn({ name: 'price_book_id' })
  priceBook: PriceBook;

  @Column({ name: 'price_version', type: 'varchar', length: 50 })
  priceVersion: string;

  @Column({ name: 'rule_id', type: 'uuid' })
  ruleId: string;

  @ManyToOne(() => PriceRule)
  @JoinColumn({ name: 'rule_id' })
  rule: PriceRule;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  quantity: string;

  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 6 })
  unitPrice: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: string;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ name: 'calculation_metadata', type: 'jsonb' })
  calculationMetadata: CalculationMetadata;

  @Column({ name: 'calculated_at', type: 'timestamptz' })
  calculatedAt: Date;

  @Column({ name: 'rerating_job_id', type: 'uuid', nullable: true })
  reratingJobId: string | null;

  @Column({ name: 'supersedes_charge_id', type: 'uuid', nullable: true })
  supersedesChargeId: string | null;

  @ManyToOne(() => RatedCharge, { nullable: true })
  @JoinColumn({ name: 'supersedes_charge_id' })
  supersedesCharge: RatedCharge | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

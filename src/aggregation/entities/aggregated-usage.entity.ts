import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Quantity } from '../../common/types';

@Entity('aggregated_usage')
@Index(['customerId', 'windowStart'])
@Index(['metricType', 'windowStart'])
@Index(['customerId', 'isFinal', 'windowStart'], {
  where: 'is_final = true',
})
@Index(['customerId', 'metricType', 'windowStart', 'windowEnd'], {
  unique: true,
  where: 'rerating_job_id IS NULL',
})
export class AggregatedUsage {
  @PrimaryGeneratedColumn('uuid')
  @Column({ name: 'aggregation_id' })
  aggregationId: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'metric_type', type: 'varchar', length: 100 })
  metricType: string;

  @Column({ name: 'window_start', type: 'timestamptz' })
  windowStart: Date;

  @Column({ name: 'window_end', type: 'timestamptz' })
  windowEnd: Date;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  value: Quantity;

  @Column({ type: 'varchar', length: 50 })
  unit: string;

  @Column({ name: 'event_count', type: 'int' })
  eventCount: number;

  @Column({ name: 'event_ids', type: 'uuid', array: true })
  eventIds: string[];

  @Column({ name: 'is_final', type: 'boolean', default: false })
  isFinal: boolean;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ name: 'computed_at', type: 'timestamptz' })
  computedAt: Date;

  @Column({ name: 'rerating_job_id', type: 'uuid', nullable: true })
  reratingJobId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

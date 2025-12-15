import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('aggregated_usage')
@Index(['customer_id', 'window_start'])
@Index(['metric_type', 'window_start'])
@Index(['customer_id', 'is_final', 'window_start'], {
  where: 'is_final = true',
})
@Index(['customer_id', 'metric_type', 'window_start', 'window_end'], {
  unique: true,
  where: 'rerating_job_id IS NULL',
})
export class AggregatedUsage {
  @PrimaryGeneratedColumn('uuid')
  aggregation_id: string;

  @Column({ type: 'uuid' })
  customer_id: string;

  @Column({ type: 'varchar', length: 100 })
  metric_type: string;

  @Column({ type: 'timestamptz' })
  window_start: Date;

  @Column({ type: 'timestamptz' })
  window_end: Date;

  @Column({ type: 'decimal', precision: 20, scale: 6 })
  value: string;

  @Column({ type: 'varchar', length: 50 })
  unit: string;

  @Column({ type: 'int' })
  event_count: number;

  @Column({ type: 'uuid', array: true })
  event_ids: string[];

  @Column({ type: 'boolean', default: false })
  is_final: boolean;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'timestamptz' })
  computed_at: Date;

  @Column({ type: 'uuid', nullable: true })
  rerating_job_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('telemetry_events')
@Index(['customer_id', 'event_time'])
@Index(['event_type', 'event_time'])
@Index(['ingestion_time'], { where: 'processed_at IS NULL' })
export class TelemetryEvent {
  @PrimaryColumn({ type: 'uuid' })
  event_id: string;

  @Column({ type: 'varchar', length: 100 })
  event_type: string;

  @Column({ type: 'uuid' })
  customer_id: string;

  @Column({ type: 'timestamptz' })
  event_time: Date;

  @Column({ type: 'timestamptz' })
  ingestion_time: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ type: 'varchar', length: 255, nullable: true })
  source: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  processed_at: Date | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  processing_version: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

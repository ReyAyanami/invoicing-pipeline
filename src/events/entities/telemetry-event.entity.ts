import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('telemetry_events')
@Index(['customerId', 'eventTime'])
@Index(['eventType', 'eventTime'])
@Index(['ingestionTime'], { where: 'processed_at IS NULL' })
export class TelemetryEvent {
  @PrimaryColumn({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'event_time', type: 'timestamptz' })
  eventTime: Date;

  @Column({ name: 'ingestion_time', type: 'timestamptz' })
  ingestionTime: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ type: 'varchar', length: 255, nullable: true })
  source: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({
    name: 'processing_version',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  processingVersion: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

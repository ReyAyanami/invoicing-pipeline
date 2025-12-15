import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('invoices')
@Index(['customer_id', 'billing_period_start'])
@Index(['status', 'due_at'], { where: "status IN ('issued', 'overdue')" })
@Index(['reference_invoice_id'], { where: "invoice_type = 'correction'" })
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  invoice_id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  invoice_number: string;

  @Column({ type: 'varchar', length: 20, default: 'standard' })
  invoice_type: 'standard' | 'correction' | 'credit_memo';

  @Column({ type: 'uuid' })
  customer_id: string;

  @Column({ type: 'timestamptz' })
  billing_period_start: Date;

  @Column({ type: 'timestamptz' })
  billing_period_end: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  tax: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  credits_applied: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: string;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: 'draft' | 'issued' | 'paid' | 'void' | 'overdue';

  @Column({ type: 'timestamptz', nullable: true })
  issued_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  due_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  paid_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  reference_invoice_id: string | null;

  @ManyToOne(() => Invoice, { nullable: true })
  @JoinColumn({ name: 'reference_invoice_id' })
  reference_invoice: Invoice | null;

  @Column({ type: 'text', nullable: true })
  correction_reason: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

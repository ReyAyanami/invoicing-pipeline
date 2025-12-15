import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { InvoiceLineItem } from './invoice-line-item.entity';
import { Money } from '../../common/types';

@Entity('invoices')
@Index(['customerId', 'billingPeriodStart'])
@Index(['status', 'dueAt'], { where: "status IN ('issued', 'overdue')" })
@Index(['referenceInvoiceId'], { where: "invoice_type = 'correction'" })
export class Invoice {
  @PrimaryGeneratedColumn('uuid')
  @Column({ name: 'invoice_id' })
  invoiceId: string;

  @Column({ name: 'invoice_number', type: 'varchar', length: 50, unique: true })
  invoiceNumber: string;

  @Column({
    name: 'invoice_type',
    type: 'varchar',
    length: 20,
    default: 'standard',
  })
  invoiceType: 'standard' | 'correction' | 'credit_memo';

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'billing_period_start', type: 'timestamptz' })
  billingPeriodStart: Date;

  @Column({ name: 'billing_period_end', type: 'timestamptz' })
  billingPeriodEnd: Date;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  subtotal: Money;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  tax: Money;

  @Column({
    name: 'credits_applied',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
  })
  creditsApplied: Money;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: Money;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: 'draft' | 'issued' | 'paid' | 'void' | 'overdue';

  @Column({ name: 'issued_at', type: 'timestamptz', nullable: true })
  issuedAt: Date | null;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt: Date | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'reference_invoice_id', type: 'uuid', nullable: true })
  referenceInvoiceId: string | null;

  @ManyToOne(() => Invoice, { nullable: true })
  @JoinColumn({ name: 'reference_invoice_id' })
  referenceInvoice: Invoice | null;

  @Column({ name: 'correction_reason', type: 'text', nullable: true })
  correctionReason: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @OneToMany(() => InvoiceLineItem, (lineItem) => lineItem.invoice)
  lineItems: InvoiceLineItem[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

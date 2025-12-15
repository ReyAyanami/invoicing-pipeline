import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Invoice } from './invoice.entity';

@Entity('invoice_line_items')
@Index(['invoiceId', 'lineNumber'])
export class InvoiceLineItem {
  @PrimaryGeneratedColumn('uuid')
  @Column({ name: 'line_item_id' })
  lineItemId: string;

  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId: string;

  @ManyToOne(() => Invoice, (invoice) => invoice.lineItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ name: 'line_number', type: 'int' })
  lineNumber: number;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'metric_type', type: 'varchar', length: 100, nullable: true })
  metricType: string | null;

  @Column({ type: 'decimal', precision: 20, scale: 6, nullable: true })
  quantity: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  unit: string | null;

  @Column({
    name: 'unit_price',
    type: 'decimal',
    precision: 12,
    scale: 6,
    nullable: true,
  })
  unitPrice: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @Column({ name: 'charge_ids', type: 'uuid', array: true })
  chargeIds: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

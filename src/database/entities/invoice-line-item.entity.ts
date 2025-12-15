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
@Index(['invoice_id', 'line_number'])
export class InvoiceLineItem {
  @PrimaryGeneratedColumn('uuid')
  line_item_id: string;

  @Column({ type: 'uuid' })
  invoice_id: string;

  @ManyToOne(() => Invoice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @Column({ type: 'int' })
  line_number: number;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  metric_type: string | null;

  @Column({ type: 'decimal', precision: 20, scale: 6, nullable: true })
  quantity: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  unit: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 6, nullable: true })
  unit_price: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: string;

  @Column({ type: 'uuid', array: true })
  charge_ids: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

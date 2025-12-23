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
import { CustomerCredit } from '../../customers/entities/customer-credit.entity';
import { Money } from '../../common/types';

@Entity('invoice_adjustments')
@Index(['invoiceId'])
export class InvoiceAdjustment {
    @PrimaryGeneratedColumn('uuid')
    @Column({ name: 'adjustment_id' })
    adjustmentId: string;

    @Column({ name: 'invoice_id', type: 'uuid' })
    invoiceId: string;

    @ManyToOne(() => Invoice, (invoice) => invoice.metadata) // Using metadata as placeholder for back-ref if needed
    @JoinColumn({ name: 'invoice_id' })
    invoice: Invoice;

    @Column({ name: 'credit_id', type: 'uuid', nullable: true })
    creditId: string | null;

    @ManyToOne(() => CustomerCredit, { nullable: true })
    @JoinColumn({ name: 'credit_id' })
    credit: CustomerCredit | null;

    @Column({ type: 'decimal', precision: 12, scale: 2 })
    amount: Money;

    @Column({
        type: 'varchar',
        length: 20,
    })
    type: 'credit_application' | 'manual_discount' | 'surcharge';

    @Column({ type: 'text', nullable: true })
    reason: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;
}

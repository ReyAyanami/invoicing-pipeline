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
import { Customer } from './customer.entity';
import { Money } from '../../common/types';

@Entity('customer_credits')
@Index(['customerId', 'status'])
@Index(['expiresAt'], { where: 'expires_at IS NOT NULL' })
export class CustomerCredit {
    @PrimaryGeneratedColumn('uuid')
    @Column({ name: 'credit_id' })
    creditId: string;

    @Column({ name: 'customer_id', type: 'uuid' })
    customerId: string;

    @ManyToOne(() => Customer)
    @JoinColumn({ name: 'customer_id' })
    customer: Customer;

    @Column({ type: 'decimal', precision: 12, scale: 2 })
    amount: Money;

    @Column({
        name: 'remaining_amount',
        type: 'decimal',
        precision: 12,
        scale: 2,
    })
    remainingAmount: Money;

    @Column({ type: 'varchar', length: 3, default: 'USD' })
    currency: string;

    @Column({ type: 'varchar', length: 20, default: 'active' })
    status: 'active' | 'fully_used' | 'expired' | 'void';

    @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
    expiresAt: Date | null;

    @Column({ type: 'jsonb', default: {} })
    metadata: Record<string, unknown>;

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;
}

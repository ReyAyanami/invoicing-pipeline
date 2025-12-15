import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  @Column({ name: 'customer_id' })
  customerId: string;

  @Column({
    name: 'external_id',
    type: 'varchar',
    length: 255,
    unique: true,
    nullable: true,
  })
  @Index()
  externalId: string | null;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({
    name: 'billing_currency',
    type: 'varchar',
    length: 3,
    default: 'USD',
  })
  billingCurrency: string;

  @Column({
    name: 'billing_cycle',
    type: 'varchar',
    length: 20,
    default: 'monthly',
  })
  billingCycle: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  @Index()
  status: 'active' | 'suspended' | 'cancelled';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

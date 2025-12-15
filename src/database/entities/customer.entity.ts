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
  customer_id: string;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  @Index()
  external_id: string | null;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  billing_currency: string;

  @Column({ type: 'varchar', length: 20, default: 'monthly' })
  billing_cycle: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  @Index()
  status: 'active' | 'suspended' | 'cancelled';

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

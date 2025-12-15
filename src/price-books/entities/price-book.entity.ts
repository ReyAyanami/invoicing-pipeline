import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('price_books')
@Index(['effectiveFrom', 'effectiveUntil'])
@Index(['effectiveFrom'], { where: 'effective_until IS NULL' })
@Index(['parentId', 'effectiveFrom'], {
  unique: true,
  where: 'parent_id IS NOT NULL',
})
export class PriceBook {
  @PrimaryGeneratedColumn('uuid')
  @Column({ name: 'price_book_id' })
  priceBookId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId: string | null;

  @ManyToOne(() => PriceBook, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: PriceBook | null;

  @Column({ type: 'varchar', length: 50 })
  version: string;

  @Column({ name: 'effective_from', type: 'timestamptz' })
  effectiveFrom: Date;

  @Column({ name: 'effective_until', type: 'timestamptz', nullable: true })
  effectiveUntil: Date | null;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ name: 'created_by', type: 'varchar', length: 255, nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

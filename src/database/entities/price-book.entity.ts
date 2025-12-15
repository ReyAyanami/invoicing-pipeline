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
@Index(['effective_from', 'effective_until'])
@Index(['effective_from'], { where: 'effective_until IS NULL' })
@Index(['parent_id', 'effective_from'], {
  unique: true,
  where: 'parent_id IS NOT NULL',
})
export class PriceBook {
  @PrimaryGeneratedColumn('uuid')
  price_book_id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'uuid', nullable: true })
  parent_id: string | null;

  @ManyToOne(() => PriceBook, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: PriceBook | null;

  @Column({ type: 'varchar', length: 50 })
  version: string;

  @Column({ type: 'timestamptz' })
  effective_from: Date;

  @Column({ type: 'timestamptz', nullable: true })
  effective_until: Date | null;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  created_by: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

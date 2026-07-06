import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('referral_cashback_config')
export class ReferralCashbackConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'default_percent', type: 'decimal', precision: 6, scale: 4, default: 10 })
  defaultPercent: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'expiration_months', type: 'int', default: 3 })
  expirationMonths: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

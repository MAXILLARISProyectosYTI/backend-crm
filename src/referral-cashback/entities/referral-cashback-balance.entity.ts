import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ReferralCashbackLedger } from './referral-cashback-ledger.entity';
import { ReferralCashbackCurrency } from '../enums/referral-cashback.enums';

@Entity('referral_cashback_balance')
@Index('uq_referral_cashback_balance_patient_currency', ['patientId', 'currency'], {
  unique: true,
})
export class ReferralCashbackBalance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'patient_id', type: 'int' })
  patientId: number;

  @Column({ type: 'varchar', length: 3 })
  currency: ReferralCashbackCurrency;

  @Column({ name: 'available_amount', type: 'decimal', precision: 14, scale: 2, default: 0 })
  availableAmount: number;

  @Column({ name: 'total_earned', type: 'decimal', precision: 14, scale: 2, default: 0 })
  totalEarned: number;

  @Column({ name: 'total_used', type: 'decimal', precision: 14, scale: 2, default: 0 })
  totalUsed: number;

  @Column({ name: 'referrer_opportunity_id', type: 'varchar', length: 17, nullable: true })
  referrerOpportunityId: string | null;

  @OneToMany(() => ReferralCashbackLedger, (l) => l.balance)
  ledgerEntries: ReferralCashbackLedger[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ReferralCashbackBalance } from './referral-cashback-balance.entity';
import {
  ReferralCashbackCurrency,
  ReferralCashbackLedgerType,
} from '../enums/referral-cashback.enums';

@Entity('referral_cashback_ledger')
export class ReferralCashbackLedger {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'balance_id', type: 'int' })
  balanceId: number;

  @ManyToOne(() => ReferralCashbackBalance, (b) => b.ledgerEntries)
  @JoinColumn({ name: 'balance_id' })
  balance: ReferralCashbackBalance;

  @Column({ name: 'entry_type', type: 'varchar', length: 20 })
  entryType: ReferralCashbackLedgerType;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3 })
  currency: ReferralCashbackCurrency;

  @Column({ name: 'percent_applied', type: 'decimal', precision: 6, scale: 4, nullable: true })
  percentApplied: number | null;

  @Column({ name: 'referrer_patient_id', type: 'int', nullable: true })
  referrerPatientId: number | null;

  @Column({ name: 'referred_patient_id', type: 'int', nullable: true })
  referredPatientId: number | null;

  @Column({ name: 'referrer_opportunity_id', type: 'varchar', length: 17, nullable: true })
  referrerOpportunityId: string | null;

  @Column({ name: 'referred_opportunity_id', type: 'varchar', length: 17, nullable: true })
  referredOpportunityId: string | null;

  @Column({ name: 'source_irb_id', type: 'int', nullable: true })
  sourceIrbId: number | null;

  @Column({ name: 'source_contract_id', type: 'int', nullable: true })
  sourceContractId: number | null;

  @Column({ name: 'apply_context', type: 'varchar', length: 80, nullable: true })
  applyContext: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  /** Solo EARNED: fecha límite de uso del crédito (FIFO). */
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index, UpdateDateColumn,
} from 'typeorm';
import { CommissionPeriod } from './commission-period.entity';

@Entity('commission_period_rate')
@Index('uq_period_rate', ['periodId', 'typeCode'], { unique: true })
export class CommissionPeriodRate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'period_id', type: 'integer' })
  periodId: number;

  @ManyToOne(() => CommissionPeriod, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'period_id' })
  period: CommissionPeriod;

  @Column({ name: 'type_code', type: 'varchar', length: 120 })
  typeCode: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

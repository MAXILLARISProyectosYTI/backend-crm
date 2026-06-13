import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { CommissionPeriod } from './commission-period.entity';

@Entity('commission_cerradora_sede_apoyo')
@Index('uq_cerradora_sede_apoyo_period', ['periodId', 'userId', 'campusId'], {
  unique: true,
  where: 'period_id IS NOT NULL',
})
export class CommissionCerradoraSedeApoyo {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'period_id', type: 'integer', nullable: true })
  periodId: number | null;

  @ManyToOne(() => CommissionPeriod, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'period_id' })
  period?: CommissionPeriod | null;

  @Column({ name: 'user_id', type: 'varchar', length: 50 })
  userId: string;

  @Column({ name: 'campus_id', type: 'integer' })
  campusId: number;

  /** Porcentaje de comisión en sede de apoyo (0.20 = 20%). */
  @Column({ type: 'decimal', precision: 6, scale: 4, default: 0.2 })
  porcentaje: number;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

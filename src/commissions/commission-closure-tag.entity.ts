import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne,
  CreateDateColumn, JoinColumn, Index,
} from 'typeorm';
import { CommissionPeriod } from './commission-period.entity';
import { CommissionType } from './commission-type.entity';

@Entity('commission_closure_tag')
export class CommissionClosureTag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'contract_id', type: 'integer', unique: true })
  contractId: number;

  @Column({ name: 'quotation_id', type: 'integer', nullable: true })
  quotationId: number | null;

  @ManyToOne(() => CommissionPeriod, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'period_id' })
  period: CommissionPeriod | null;

  /** MISMO_DIA: pago mismo día o hasta 2 días después. DIFERIDO: > 2 días, dentro del mes */
  @Column({ type: 'varchar', length: 20, nullable: true })
  timing: 'MISMO_DIA' | 'DIFERIDO' | null;

  /** DOBLE: aprobación GG/GV (Alex). MAS_50: cita en feriado, domingo o fin de mes */
  @Column({ type: 'varchar', length: 20, nullable: true })
  modifier: 'DOBLE' | 'MAS_50' | null;

  @ManyToOne(() => CommissionType, { nullable: true })
  @JoinColumn({ name: 'commission_type_id' })
  commissionType: CommissionType | null;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 50, nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

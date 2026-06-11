import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne,
  CreateDateColumn, JoinColumn,
} from 'typeorm';
import { CommissionRecord } from './commission-record.entity';
import { CommissionType } from './commission-type.entity';

@Entity('commission_detail')
export class CommissionDetail {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => CommissionRecord, (r) => r.details, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'record_id' })
  record: CommissionRecord;

  @ManyToOne(() => CommissionType)
  @JoinColumn({ name: 'commission_type_id' })
  commissionType: CommissionType;

  @Column({ name: 'contract_id', type: 'integer', nullable: true })
  contractId: number | null;

  @Column({ name: 'quotation_id', type: 'integer', nullable: true })
  quotationId: number | null;

  @Column({ type: 'integer', default: 0 })
  cantidad: number;

  @Column({ name: 'importe_unitario', type: 'decimal', precision: 10, scale: 2, default: 0 })
  importeUnitario: number;

  @Column({ name: 'importe_total', type: 'decimal', precision: 10, scale: 2, default: 0 })
  importeTotal: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

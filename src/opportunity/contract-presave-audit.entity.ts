import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('contract_presave_audit')
export class ContractPresaveAudit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'contract_presave_id', type: 'int', nullable: true })
  contractPresaveId: number | null;

  @Column({ name: 'quotation_id', type: 'int' })
  quotationId: number;

  @Column({ name: 'clinic_history_id', type: 'int', nullable: true })
  clinicHistoryId: number | null;

  @Column({ type: 'varchar', length: 20, default: 'save' })
  action: string;

  @Column({ name: 'save_source', type: 'varchar', length: 50, nullable: true })
  saveSource: string | null;

  @Column({ name: 'saved_by_user_id', type: 'varchar', length: 100, nullable: true })
  savedByUserId: string | null;

  @Column({ name: 'contract_type', type: 'varchar', length: 50, nullable: true })
  contractType: string | null;

  @Column({ name: 'payment_method', type: 'varchar', length: 20, nullable: true })
  paymentMethod: string | null;

  @Column({ name: 'payments_count', type: 'int', nullable: true })
  paymentsCount: number | null;

  @Column({
    name: 'contract_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  contractAmount: number | null;

  @Column({
    name: 'schedule_total_monto_final',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  scheduleTotalMontoFinal: number | null;

  @Column({
    name: 'schedule_total_descuento',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  scheduleTotalDescuento: number | null;

  @Column({ name: 'payment_schedule_editable', type: 'text', nullable: true })
  paymentScheduleEditable: string | null;

  @Column({ name: 'registered_payments', type: 'text', nullable: true })
  registeredPayments: string | null;

  @Column({ name: 'payload_json', type: 'text', nullable: true })
  payloadJson: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

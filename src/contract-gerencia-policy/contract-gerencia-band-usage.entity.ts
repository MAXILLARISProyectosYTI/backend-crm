import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('contract_gerencia_band_usage')
export class ContractGerenciaBandUsage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'requested_by_user_id', type: 'varchar', length: 17 })
  requestedByUserId: string;

  @Column({ name: 'approver_user_id', type: 'varchar', length: 17 })
  approverUserId: string;

  @Column({ name: 'quotation_id', type: 'int', nullable: true })
  quotationId?: number;

  @Column({ name: 'contract_type', type: 'varchar', length: 50 })
  contractType: string;

  @Column({ name: 'payment_method', type: 'varchar', length: 30 })
  paymentMethod: string;

  @Column({ name: 'total_amount', type: 'decimal', precision: 12, scale: 2 })
  totalAmount: number;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'NOW()' })
  createdAt: Date;
}

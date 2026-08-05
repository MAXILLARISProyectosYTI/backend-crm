import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type CommissionOverrideArea = 'CALL_CENTER' | 'OI' | 'CONTROLES';

@Entity('commission_invoice_override')
@Index('uq_commission_invoice_override', ['area', 'invoiceId'], { unique: true })
export class CommissionInvoiceOverride {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20 })
  area: CommissionOverrideArea;

  @Column({ name: 'invoice_id', type: 'integer' })
  invoiceId: number;

  @Column({ name: 'assigned_user_login', type: 'varchar', length: 100 })
  assignedUserLogin: string;

  @Column({ name: 'assigned_user_name', type: 'varchar', length: 200, nullable: true })
  assignedUserName: string | null;

  @Column({ name: 'original_biller_login', type: 'varchar', length: 100, nullable: true })
  originalBillerLogin: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'created_by_id', type: 'varchar', length: 17 })
  createdById: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

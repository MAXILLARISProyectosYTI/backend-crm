import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('commission_type')
export class CommissionType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120, unique: true })
  code: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 30 })
  area: 'CIERRE_TTO' | 'OI' | 'CONTROLES' | 'CALL_CENTER';

  @Column({ type: 'varchar', length: 30, nullable: true })
  tratamiento: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  modalidad: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  timing: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  modifier: string | null;

  @Column({ name: 'cuota_num', type: 'integer', nullable: true })
  cuotaNum: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  amount: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

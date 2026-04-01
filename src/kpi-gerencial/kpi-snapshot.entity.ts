import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { MetaGerencial } from './meta-gerencial.entity';

@Entity('kpi_snapshot')
@Unique('uq_kpi_snapshot_fecha_campus_tipo', ['fecha', 'campusId', 'tipoKpi'])
export class KpiSnapshot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  @Index('idx_kpi_snapshot_fecha')
  fecha: string;

  @Column({ name: 'campus_id', type: 'integer', nullable: true })
  @Index('idx_kpi_snapshot_campus')
  campusId: number | null;

  @Column({ name: 'tipo_kpi', type: 'varchar', length: 100 })
  @Index('idx_kpi_snapshot_tipo')
  tipoKpi: string;

  @Column({ type: 'jsonb', default: '{}' })
  datos: Record<string, unknown>;

  @Column({ name: 'meta_gerencial_id', type: 'integer', nullable: true })
  metaGerencialId: number | null;

  @ManyToOne(() => MetaGerencial, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'meta_gerencial_id' })
  metaGerencial: MetaGerencial | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

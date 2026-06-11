import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany,
  CreateDateColumn, UpdateDateColumn, JoinColumn, Index,
} from 'typeorm';
import { CommissionPeriod } from './commission-period.entity';
import { CommissionDetail } from './commission-detail.entity';

@Entity('commission_record')
@Index('uq_commission_record', ['period', 'userId', 'campusId'], { unique: true })
export class CommissionRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => CommissionPeriod, (p) => p.records, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'period_id' })
  period: CommissionPeriod;

  @Column({ name: 'user_id', type: 'varchar', length: 50 })
  userId: string;

  @Column({ name: 'user_name', type: 'varchar', length: 200, nullable: true })
  userName: string | null;

  @Column({ name: 'campus_id', type: 'integer', nullable: true })
  campusId: number | null;

  @Column({ name: 'campus_nombre', type: 'varchar', length: 150, nullable: true })
  campusNombre: string | null;

  /** Meta monto sin IGV individual (Controles) */
  @Column({ name: 'meta_monto_individual', type: 'decimal', precision: 12, scale: 2, nullable: true })
  metaMontoIndividual: number | null;

  @Column({ name: 'monto_facturado_con_igv', type: 'decimal', precision: 12, scale: 2, default: 0 })
  montoFacturadoConIgv: number;

  @Column({ name: 'monto_facturado_sin_igv', type: 'decimal', precision: 12, scale: 2, default: 0 })
  montoFacturadoSinIgv: number;

  @Column({ name: 'cantidad_unidades', type: 'integer', default: 0 })
  cantidadUnidades: number;

  @Column({ name: 'porcentaje_alcanzado', type: 'decimal', precision: 6, scale: 4, nullable: true })
  porcentajeAlcanzado: number | null;

  /** Controles: distribución base asignada al ejecutivo en el período */
  @Column({ name: 'db_asignada', type: 'decimal', precision: 12, scale: 2, nullable: true })
  dbAsignada: number | null;

  /** 0.01 para Jenny Aguirre, 1 para el resto */
  @Column({ name: 'factor_especial', type: 'decimal', precision: 8, scale: 6, default: 1 })
  factorEspecial: number;

  @Column({ name: 'comision_ttos', type: 'decimal', precision: 10, scale: 2, default: 0 })
  comisionTtos: number;

  @Column({ name: 'comision_evaluaciones', type: 'decimal', precision: 10, scale: 2, default: 0 })
  comisionEvaluaciones: number;

  @Column({ name: 'comision_bono', type: 'decimal', precision: 10, scale: 2, default: 0 })
  comisionBono: number;

  /** Cerradoras: comisión por facturación OI (% configurable, default 2%) */
  @Column({ name: 'comision_oi', type: 'decimal', precision: 10, scale: 2, default: 0 })
  comisionOi: number;

  @Column({ name: 'monto_facturado_oi_con_igv', type: 'decimal', precision: 12, scale: 2, default: 0 })
  montoFacturadoOiConIgv: number;

  /** Cerradoras: factor sede (1 = sede principal, 0.2 = apoyo 20%) */
  @Column({ name: 'porcentaje_sede_apoyo', type: 'decimal', precision: 6, scale: 4, nullable: true })
  porcentajeSedeApoyo: number | null;

  @Column({ name: 'comision_total', type: 'decimal', precision: 10, scale: 2, default: 0 })
  comisionTotal: number;

  @Column({ type: 'varchar', length: 20, default: 'PENDIENTE' })
  estado: 'PENDIENTE' | 'CALCULADO' | 'APROBADO' | 'PAGADO';

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @OneToMany(() => CommissionDetail, (d) => d.record)
  details: CommissionDetail[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

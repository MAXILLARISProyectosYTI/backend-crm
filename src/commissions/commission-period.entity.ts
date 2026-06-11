import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, OneToMany, Index,
} from 'typeorm';
import { CommissionRecord } from './commission-record.entity';

@Entity('commission_period')
@Index('uq_commission_period', ['year', 'month', 'area', 'campusId'], { unique: true })
export class CommissionPeriod {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  year: number;

  @Column({ type: 'integer' })
  month: number;

  @Column({ type: 'varchar', length: 30 })
  area: 'CIERRE_TTO' | 'OI' | 'CONTROLES';

  @Column({ name: 'campus_id', type: 'integer', nullable: true })
  campusId: number | null;

  @Column({ name: 'campus_nombre', type: 'varchar', length: 150, nullable: true })
  campusNombre: string | null;

  @Column({ name: 'meta_monto_con_igv', type: 'decimal', precision: 12, scale: 2, nullable: true })
  metaMontoConIgv: number | null;

  @Column({ name: 'meta_monto_sin_igv', type: 'decimal', precision: 12, scale: 2, nullable: true })
  metaMontoSinIgv: number | null;

  @Column({ name: 'meta_cantidad', type: 'integer', nullable: true })
  metaCantidad: number | null;

  /** OI: base fija sobre la cual se calcula el diferencial comisionable (S/ 40,000 con IGV) */
  @Column({ name: 'base_fija_con_igv', type: 'decimal', precision: 12, scale: 2, nullable: true })
  baseFijaConIgv: number | null;

  /** OI: número de ejecutivas activas en el período (define el % de comisión) */
  @Column({ name: 'n_ejecutivas', type: 'integer', nullable: true })
  nEjecutivas: number | null;

  /** Porcentaje fijo de comisión OI sobre tratamientos (3.5%) */
  @Column({ name: 'porcentaje_comision', type: 'decimal', precision: 6, scale: 4, nullable: true })
  porcentajeComision: number | null;

  /** Controles: distribución base total del grupo */
  @Column({ name: 'db_total', type: 'decimal', precision: 12, scale: 2, nullable: true })
  dbTotal: number | null;

  /** OI: objetivo de evaluaciones por ejecutivo */
  @Column({ name: 'obj_evaluaciones', type: 'integer', nullable: true })
  objEvaluaciones: number | null;

  @Column({ type: 'varchar', length: 20, default: 'BORRADOR' })
  estado: 'BORRADOR' | 'CERRADO' | 'PAGADO';

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  /** Cerradoras: umbral de ttos personales para bono (default 45) */
  @Column({ name: 'bono_personal_ttos_threshold', type: 'integer', nullable: true, default: 45 })
  bonoPersonalTtosThreshold: number | null;

  @Column({ name: 'bono_personal_amount', type: 'decimal', precision: 10, scale: 2, nullable: true, default: 500 })
  bonoPersonalAmount: number | null;

  /** Cerradoras: umbral de ttos del equipo por sede (default 75) */
  @Column({ name: 'bono_equipo_ttos_threshold', type: 'integer', nullable: true, default: 75 })
  bonoEquipoTtosThreshold: number | null;

  @Column({ name: 'bono_equipo_amount', type: 'decimal', precision: 10, scale: 2, nullable: true, default: 1000 })
  bonoEquipoAmount: number | null;

  /** Cerradoras: % sobre facturación OI (default 2%) */
  @Column({ name: 'porcentaje_comision_oi', type: 'decimal', precision: 6, scale: 4, nullable: true, default: 0.02 })
  porcentajeComisionOi: number | null;

  @OneToMany(() => CommissionRecord, (r) => r.period)
  records: CommissionRecord[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

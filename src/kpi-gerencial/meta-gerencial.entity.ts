import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

@Entity('meta_gerencial')
@Index('idx_meta_gerencial_fecha', ['fechaInicio', 'fechaFin'])
export class MetaGerencial {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  @Index('idx_meta_gerencial_area')
  area: string;

  @Column({ name: 'campus_id', type: 'integer', nullable: true })
  @Index('idx_meta_gerencial_campus')
  campusId: number | null;

  @Column({ name: 'campus_nombre', type: 'varchar', length: 150, nullable: true })
  campusNombre: string | null;

  @Column({ name: 'fecha_inicio', type: 'date' })
  fechaInicio: string;

  @Column({ name: 'fecha_fin', type: 'date' })
  fechaFin: string;

  @Column({ name: 'dias_habiles', type: 'integer', default: 22 })
  diasHabiles: number;

  @Column({ name: 'meta_monto', type: 'decimal', precision: 12, scale: 2, default: 0 })
  metaMonto: number;

  @Column({ name: 'meta_cantidad', type: 'integer', default: 0 })
  metaCantidad: number;

  @Column({ type: 'varchar', length: 5, default: 'PEN' })
  moneda: string;

  @Column({ type: 'text', nullable: true })
  notas: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

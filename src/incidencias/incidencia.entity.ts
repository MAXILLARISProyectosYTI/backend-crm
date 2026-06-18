import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TipoIncidencia =
  | 'Queja'
  | 'Urgencia médica'
  | 'Fallo de cita'
  | 'Problema de pago'
  | 'Comunicación'
  | 'Otro';

export type PrioridadIncidencia = 'Alta' | 'Media' | 'Baja';

export type EstadoIncidencia = 'Abierta' | 'En revisión' | 'Resuelta' | 'Cerrada';

/** Misma convención que `issue_area` en SV (1–6). */
export type AreaDestino =
  | 'Cobranza'
  | 'Clínica'
  | 'Laboratorio'
  | 'Ventas'
  | 'Recepción'
  | 'Facturación';

@Entity('crm_incidencias')
export class Incidencia {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  titulo: string;

  @Column({ type: 'text' })
  descripcion: string;

  @Column({ type: 'varchar', length: 50, default: 'Queja' })
  tipo: TipoIncidencia;

  @Column({ type: 'varchar', length: 10, default: 'Media' })
  prioridad: PrioridadIncidencia;

  @Column({ type: 'varchar', length: 20, default: 'Abierta' })
  estado: EstadoIncidencia;

  @Column({ type: 'int', name: 'paciente_id' })
  pacienteId: number;

  @Column({ type: 'varchar', length: 255, name: 'paciente_nombre' })
  pacienteNombre: string;

  @Column({ type: 'varchar', length: 100, name: 'creada_por', default: 'Admin' })
  creadaPor: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'ejecutivo_username' })
  ejecutivoUsername: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, default: 'Recepción', name: 'area_destino' })
  areaDestino: string | null;

  /** ID del issue en SV (`POST /issues`) cuando la sync fue exitosa. */
  @Column({ type: 'int', nullable: true, name: 'sv_issue_id' })
  svIssueId: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true, default: 'synced', name: 'sync_status' })
  syncStatus: string | null;

  @Column({ type: 'text', nullable: true, name: 'sync_error' })
  syncError: string | null;

  @CreateDateColumn({ name: 'fecha_creacion' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_actualizacion' })
  fechaActualizacion: Date;
}

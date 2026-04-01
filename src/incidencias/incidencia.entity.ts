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

  @CreateDateColumn({ name: 'fecha_creacion' })
  fechaCreacion: Date;

  @UpdateDateColumn({ name: 'fecha_actualizacion' })
  fechaActualizacion: Date;
}

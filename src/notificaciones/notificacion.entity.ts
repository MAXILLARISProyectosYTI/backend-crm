import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type TipoNotificacion =
  | 'cita'
  | 'alerta'
  | 'sin_agendamiento'
  | 'urgencia'
  | 'asignacion';

export type EstadoNotificacion = 'nueva' | 'leida';

@Entity('crm_notificaciones')
export class Notificacion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 30 })
  tipo: TipoNotificacion;

  @Column({ type: 'varchar', length: 255 })
  titulo: string;

  @Column({ type: 'text' })
  descripcion: string;

  @Column({ type: 'int', name: 'paciente_id' })
  pacienteId: number;

  @Column({ type: 'varchar', length: 255, name: 'paciente_nombre' })
  pacienteNombre: string;

  @Column({ type: 'varchar', length: 20, default: 'nueva' })
  estado: EstadoNotificacion;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'ejecutivo_username' })
  ejecutivoUsername: string | null;

  @CreateDateColumn({ name: 'fecha_creacion' })
  fechaCreacion: Date;
}

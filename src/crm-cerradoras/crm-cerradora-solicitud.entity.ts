import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TipoSolicitud = 'demora_contrato' | 'demora_facturacion';
export type EstadoSolicitud = 'pendiente' | 'aprobada' | 'rechazada';
export type EstadoFirmaContrato = 'pendiente' | 'firmado' | 'rechazado';

@Entity('crm_cerradora_solicitudes')
export class CrmCerradoraSolicitud {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100, name: 'cerradora_username' })
  cerradoraUsername: string;

  @Column({ type: 'varchar', length: 255, name: 'cerradora_nombre' })
  cerradoraNombre: string;

  @Column({ type: 'int', nullable: true, name: 'clinic_history_id' })
  clinicHistoryId: number | null;

  @Column({ type: 'varchar', length: 255, name: 'paciente_nombre' })
  pacienteNombre: string;

  @Column({ type: 'int', nullable: true, name: 'quotation_id' })
  quotationId: number | null;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'opportunity_id' })
  opportunityId: string | null;

  /** Tipo de demora: por presentación de contrato o por facturación */
  @Column({ type: 'varchar', length: 30, name: 'tipo_solicitud', default: 'demora_contrato' })
  tipoSolicitud: TipoSolicitud;

  @Column({ type: 'text' })
  motivo: string;

  @Column({ type: 'varchar', length: 20, default: 'pendiente' })
  estado: EstadoSolicitud;

  @Column({ type: 'text', nullable: true, name: 'comentario_admin' })
  comentarioAdmin: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'admin_username' })
  adminUsername: string | null;

  /** Estado del contrato: la cerradora lo actualiza manualmente */
  @Column({ type: 'varchar', length: 20, name: 'firma_contrato', default: 'pendiente' })
  firmaContrato: EstadoFirmaContrato;

  @Column({ type: 'timestamp', nullable: true, name: 'fecha_contrato' })
  fechaContrato: Date | null;

  /** Si el pago/facturación ya fue completado (derivado de consulta SV o marcado manual) */
  @Column({ type: 'boolean', name: 'facturado', default: false })
  facturado: boolean;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  monto: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'tipo_contrato' })
  tipoContrato: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

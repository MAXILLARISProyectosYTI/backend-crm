import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Sub-estados de facturación para cierre ganado */
export enum FacturacionSubEstado {
  /** Cierre con factura directa (URLs enviadas por front) */
  FACTURA_DIRECTA = 'factura_directa',
  /** Cierre con O.S asociada(s), esperando que esté facturada en invoice-mifact */
  ORDEN_SERVICIO_PENDIENTE_FACTURA = 'orden_servicio_pendiente_factura',
}

/**
 * Órdenes de servicio (O.S) asociadas a una oportunidad.
 * Se consulta metódicamente GET /invoice-mifact-v3/service-order/:serviceOrderId/invoice-status.
 * Cuando facturado=true se descargan las URLs y se completa el cierre ganado.
 */
@Entity('opportunity_service_order')
@Index('idx_opportunity_service_order_opportunity_id', ['opportunityId'])
@Index('idx_opportunity_service_order_service_order_id', ['serviceOrderId'])
export class OpportunityServiceOrder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 17, name: 'opportunity_id' })
  opportunityId: string;

  /** ID de la orden de servicio en el sistema externo (invoice-mifact) */
  @Column({ type: 'integer', name: 'service_order_id' })
  serviceOrderId: number;

  /** Metadata adicional (JSON). Ej: { descripcion, numero_os, etc. } */
  @Column({ type: 'text', nullable: true, name: 'metadata' })
  metadata?: string;

  @Column({ type: 'boolean', nullable: true, default: false, name: 'facturado' })
  facturado?: boolean;

  @Column({ type: 'integer', nullable: true, name: 'invoice_result_head_id' })
  invoiceResultHeadId?: number;

  @Column({ type: 'text', nullable: true, name: 'url_soles' })
  urlSoles?: string;

  @Column({ type: 'text', nullable: true, name: 'url_dolares' })
  urlDolares?: string;

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'last_checked_at' })
  lastCheckedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("contract_presave")
export class ContractPresave {
  @PrimaryGeneratedColumn()
  id: number;

  // Identificador único: quotationId
  @Column({ name: "quotation_id", type: "int", unique: true })
  quotationId: number;

  @Column({ name: "clinic_history_id", type: "int", nullable: true })
  clinicHistoryId: number;

  // ========================================
  // DATOS DE FACTURACIÓN (editables)
  // ========================================
  @Column({ name: "tipo_documento_factura", type: "varchar", length: 10, nullable: true })
  tipoDocumentoFactura: string; // DNI o RUC

  @Column({ name: "nombre_factura", type: "varchar", length: 255, nullable: true })
  nombreFactura: string;

  @Column({ name: "numero_documento_factura", type: "varchar", length: 20, nullable: true })
  numeroDocumentoFactura: string;

  // ========================================
  // CONFIGURACIÓN DEL CONTRATO
  // ========================================
  @Column({ name: "contract_type", type: "varchar", length: 50, nullable: true })
  contractType: string;

  @Column({ name: "payment_method", type: "varchar", length: 20, nullable: true })
  paymentMethod: string;

  @Column({ name: "payments_count", type: "int", nullable: true })
  paymentsCount: number;

  @Column({ name: "contract_duration_months", type: "int", nullable: true })
  contractDurationMonths: number;

  // ========================================
  // DESCUENTOS
  // ========================================
  @Column({ name: "descuento_campana_activo", type: "boolean", default: false })
  descuentoCampanaActivo: boolean;

  @Column({ name: "descuento_hoy_activo", type: "boolean", default: false })
  descuentoHoyActivo: boolean;

  @Column({ name: "descuento_discrecional_activo", type: "boolean", default: false })
  descuentoDiscrecionalActivo: boolean;

  @Column({ name: "tipo_descuento_discrecional", type: "varchar", length: 50, nullable: true })
  tipoDescuentoDiscrecional: string;

  @Column({ name: "monto_descuento_discrecional", type: "decimal", precision: 12, scale: 2, default: 0 })
  montoDescuentoDiscrecional: number;

  @Column({ name: "descuento_gerencia_solicitado", type: "boolean", default: false })
  descuentoGerenciaSolicitado: boolean;

  @Column({ name: "monto_descuento_gerencia", type: "decimal", precision: 12, scale: 2, default: 0 })
  montoDescuentoGerencia: number;

  // ========================================
  // CRONOGRAMA DE PAGOS (JSON)
  // ========================================
  @Column({ name: "payment_schedule_editable", type: "text", nullable: true })
  paymentScheduleEditable: string; // JSON string

  // ========================================
  // PAGOS REGISTRADOS - PASO 2 (JSON)
  // ========================================
  @Column({ name: "registered_payments", type: "text", nullable: true })
  registeredPayments: string; // JSON string con los pagos del Paso 2

  // ========================================
  // TIMESTAMPS
  // ========================================
  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}


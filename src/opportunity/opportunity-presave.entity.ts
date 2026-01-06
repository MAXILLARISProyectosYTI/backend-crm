import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("opportunity_presave")
export class OpportunityPresave {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "espo_id", type: "varchar", length: 255, unique: true })
  espoId: string;

  // ========================================
  // DATOS DEL CLIENTE
  // ========================================
  @Column({ name: "document_type", type: "varchar", length: 20, nullable: true })
  documentType: string;

  @Column({ name: "document_number", type: "varchar", length: 20, nullable: true })
  documentNumber: string;

  @Column({ name: "name", type: "varchar", length: 255, nullable: true })
  name: string;

  @Column({ name: "last_name_father", type: "varchar", length: 255, nullable: true })
  lastNameFather: string;

  @Column({ name: "last_name_mother", type: "varchar", length: 255, nullable: true })
  lastNameMother: string;

  @Column({ name: "cellphone", type: "varchar", length: 20, nullable: true })
  cellphone: string;

  @Column({ name: "email", type: "varchar", length: 255, nullable: true })
  email: string;

  @Column({ name: "address", type: "varchar", length: 500, nullable: true })
  address: string;

  @Column({ name: "attorney", type: "varchar", length: 255, nullable: true })
  attorney: string;

  @Column({ name: "invoise_type_document", type: "varchar", length: 50, nullable: true })
  invoiseTypeDocument: string;

  @Column({ name: "invoise_num_document", type: "varchar", length: 50, nullable: true })
  invoiseNumDocument: string;

  // ========================================
  // DATOS DE FACTURACIÓN
  // ========================================
  @Column({ name: "doctor_id", type: "int", nullable: true })
  doctorId: number;

  @Column({ name: "business_line_id", type: "int", nullable: true })
  businessLineId: number;

  @Column({ name: "specialty_id", type: "int", nullable: true })
  specialtyId: number;

  @Column({ name: "tariff_id", type: "int", nullable: true })
  tariffId: number;

  @Column({ name: "fecha_abono", type: "date", nullable: true })
  fechaAbono: Date;

  @Column({ name: "metodo_pago", type: "int", nullable: true })
  metodoPago: number;

  @Column({ name: "cuenta_bancaria", type: "int", nullable: true })
  cuentaBancaria: number;

  @Column({ name: "numero_operacion", type: "varchar", length: 100, nullable: true })
  numeroOperacion: string;

  @Column({ name: "moneda", type: "varchar", length: 10, nullable: true })
  moneda: string;

  @Column({ name: "monto_pago", type: "decimal", precision: 12, scale: 2, nullable: true })
  montoPago: number;

  @Column({ name: "description", type: "text", nullable: true })
  description: string;

  // Vouchers guardados como JSON con base64
  @Column({ name: "vouchers_data", type: "text", nullable: true })
  vouchersData: string;

  // ========================================
  // DATOS DEL PACIENTE CREADO (si aplica)
  // ========================================
  @Column({ name: "clinic_history", type: "varchar", length: 50, nullable: true })
  clinicHistory: string;

  @Column({ name: "clinic_history_id", type: "int", nullable: true })
  clinicHistoryId: number;

  // ========================================
  // TIMESTAMPS
  // ========================================
  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}

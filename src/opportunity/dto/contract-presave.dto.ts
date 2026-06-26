import { IsNumber, IsOptional, IsString, IsBoolean, MaxLength } from 'class-validator';

export class CreateContractPresaveDto {
  @IsNumber()
  quotationId: number;

  @IsOptional()
  @IsNumber()
  clinicHistoryId?: number;

  // ========================================
  // DATOS DE FACTURACIÓN (editables)
  // ========================================
  @IsOptional()
  @IsString()
  @MaxLength(10)
  tipoDocumentoFactura?: string; // DNI o RUC

  @IsOptional()
  @IsString()
  @MaxLength(255)
  nombreFactura?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  numeroDocumentoFactura?: string;

  // ========================================
  // CONFIGURACIÓN DEL CONTRATO
  // ========================================
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contractType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  paymentMethod?: string;

  @IsOptional()
  @IsNumber()
  paymentsCount?: number;

  @IsOptional()
  @IsNumber()
  contractDurationMonths?: number;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  contractDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  fixedPaymentDate?: string;

  @IsOptional()
  @IsNumber()
  contractAmount?: number;

  // ========================================
  // DESCUENTOS
  // ========================================
  @IsOptional()
  @IsBoolean()
  descuentoCampanaActivo?: boolean;

  @IsOptional()
  @IsNumber()
  montoDescuentoCampana?: number;

  @IsOptional()
  @IsBoolean()
  descuentoHoyActivo?: boolean;

  @IsOptional()
  @IsNumber()
  montoDescuentoHoy?: number;

  @IsOptional()
  @IsBoolean()
  descuentoDiscrecionalActivo?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tipoDescuentoDiscrecional?: string;

  @IsOptional()
  @IsNumber()
  montoDescuentoDiscrecional?: number;

  @IsOptional()
  @IsBoolean()
  descuentoGerenciaSolicitado?: boolean;

  @IsOptional()
  @IsNumber()
  montoDescuentoGerencia?: number;

  // ========================================
  // CRONOGRAMA DE PAGOS (JSON string)
  // ========================================
  @IsOptional()
  @IsString()
  paymentScheduleEditable?: string;

  // ========================================
  // PAGOS REGISTRADOS - PASO 2 (JSON string)
  // ========================================
  @IsOptional()
  @IsString()
  registeredPayments?: string;

  // ========================================
  // FORMULARIO DE PAGO EN CURSO (JSON string)
  // ========================================
  @IsOptional()
  @IsString()
  currentPaymentFormData?: string;

  /** Origen del guardado: manual | silent | auto_apply | delete */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  saveSource?: string;

  /** Usuario cerrador (token/url) que disparó el guardado */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  savedByUserId?: string;
}


import { IsNumber, IsOptional, IsString, IsBoolean, MaxLength } from 'class-validator';

export class CreateContractPresaveDto {
  @IsNumber()
  quotationId: number;

  @IsOptional()
  @IsNumber()
  clinicHistoryId?: number;

  // ========================================
  // DATOS DEL PACIENTE (editables)
  // ========================================
  @IsOptional()
  @IsString()
  @MaxLength(255)
  patientEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  patientPhone?: string;

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

  // ========================================
  // DESCUENTOS
  // ========================================
  @IsOptional()
  @IsBoolean()
  descuentoCampanaActivo?: boolean;

  @IsOptional()
  @IsBoolean()
  descuentoHoyActivo?: boolean;

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
}


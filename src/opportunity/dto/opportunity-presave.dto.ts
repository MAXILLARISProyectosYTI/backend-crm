import { IsString, IsOptional, MaxLength, IsNumber, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOpportunityPresaveDto {
  @IsString()
  @MaxLength(255)
  espoId: string;

  // ========================================
  // DATOS DEL CLIENTE
  // ========================================
  @IsOptional()
  @IsString()
  @MaxLength(20)
  documentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  documentNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  lastNameFather?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  lastNameMother?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cellphone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  attorney?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoiseTypeDocument?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  invoiseNumDocument?: string;

  // ========================================
  // DATOS DE FACTURACIÓN
  // ========================================
  @IsOptional()
  @IsNumber()
  doctorId?: number;

  @IsOptional()
  @IsNumber()
  businessLineId?: number;

  @IsOptional()
  @IsNumber()
  specialtyId?: number;

  @IsOptional()
  @IsNumber()
  tariffId?: number;

  @IsOptional()
  @IsDateString()
  fechaAbono?: string;

  @IsOptional()
  @IsNumber()
  metodoPago?: number;

  @IsOptional()
  @IsNumber()
  cuentaBancaria?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  numeroOperacion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  moneda?: string;

  @IsOptional()
  @IsNumber()
  montoPago?: number;

  @IsOptional()
  @IsString()
  description?: string;

  // Vouchers guardados como JSON con base64
  @IsOptional()
  @IsString()
  vouchersData?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  paymentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  companyType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  exchangeRate?: number;

  // ========================================
  // DATOS DEL PACIENTE CREADO (si aplica)
  // ========================================
  @IsOptional()
  @IsString()
  @MaxLength(50)
  clinicHistory?: string;

  @IsOptional()
  @IsNumber()
  clinicHistoryId?: number;
}

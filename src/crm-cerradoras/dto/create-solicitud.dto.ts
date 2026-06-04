import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';
import type { TipoSolicitud } from '../crm-cerradora-solicitud.entity';

export class CreateSolicitudDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  pacienteNombre: string;

  @IsOptional()
  @IsNumber()
  clinicHistoryId?: number | null;

  @IsOptional()
  @IsNumber()
  quotationId?: number | null;

  @IsEnum(['demora_contrato', 'demora_facturacion'])
  tipoSolicitud: TipoSolicitud;

  @IsNotEmpty()
  @IsString()
  motivo: string;

  @IsOptional()
  @IsNumber()
  monto?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tipoContrato?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cerradoraUsername?: string;
}

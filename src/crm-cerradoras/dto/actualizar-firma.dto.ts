import { IsEnum, IsOptional, IsString, IsNumber } from 'class-validator';
import type { EstadoFirmaContrato } from '../crm-cerradora-solicitud.entity';

export class ActualizarFirmaDto {
  @IsEnum(['pendiente', 'firmado', 'rechazado'])
  firmaContrato: EstadoFirmaContrato;

  @IsOptional()
  facturado?: boolean;

  @IsOptional()
  @IsString()
  pacienteNombre?: string;

  @IsOptional()
  @IsNumber()
  clinicHistoryId?: number;

  @IsOptional()
  @IsNumber()
  quotationId?: number;
}

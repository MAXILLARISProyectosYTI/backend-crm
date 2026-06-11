import { IsNumber, IsOptional, IsString } from 'class-validator';

export class UpsertRecordDto {
  @IsString()
  userId: string;

  @IsOptional()
  @IsString()
  userName?: string;

  @IsOptional()
  @IsNumber()
  campusId?: number;

  @IsOptional()
  @IsString()
  campusNombre?: string;

  /** Monto facturado con IGV (OI: total contratos OI del período) */
  @IsOptional()
  @IsNumber()
  montoFacturadoConIgv?: number;

  /** Monto facturado sin IGV */
  @IsOptional()
  @IsNumber()
  montoFacturadoSinIgv?: number;

  /** Controles: nº de controles facturados | OI: nº evaluaciones */
  @IsOptional()
  @IsNumber()
  cantidadUnidades?: number;

  /** Controles: distribución base asignada a este ejecutivo */
  @IsOptional()
  @IsNumber()
  dbAsignada?: number;

  /** 0.01 para Jenny Aguirre; 1 para el resto (configurable) */
  @IsOptional()
  @IsNumber()
  factorEspecial?: number;

  @IsOptional()
  @IsString()
  notas?: string;
}

import { IsNumber, IsOptional, IsString } from 'class-validator';

export class PeriodExecutivoDto {
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

  /** Meta monto sin IGV individual del ejecutivo */
  @IsOptional()
  @IsNumber()
  metaMontoSinIgv?: number;

  /** Distribución base asignada (Controles) */
  @IsOptional()
  @IsNumber()
  dbAsignada?: number;

  /** 0.01 Jenny Aguirre; 1 resto */
  @IsOptional()
  @IsNumber()
  factorEspecial?: number;

  @IsOptional()
  @IsString()
  notas?: string;
}

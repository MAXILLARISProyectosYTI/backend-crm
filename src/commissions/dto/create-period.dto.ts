import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { PeriodExecutivoDto } from './period-executivo.dto';

export class CreatePeriodDto {
  @IsInt()
  @Min(2024)
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsEnum(['CIERRE_TTO', 'OI', 'CONTROLES'])
  area: 'CIERRE_TTO' | 'OI' | 'CONTROLES';

  @IsOptional()
  @IsInt()
  campusId?: number;

  @IsOptional()
  @IsString()
  campusNombre?: string;

  @IsOptional()
  @IsNumber()
  metaMontoConIgv?: number;

  @IsOptional()
  @IsNumber()
  metaMontoSinIgv?: number;

  @IsOptional()
  @IsInt()
  metaCantidad?: number;

  /** OI: base fija comisionable (default 40000) */
  @IsOptional()
  @IsNumber()
  baseFijaConIgv?: number;

  /** OI: número de ejecutivas activas (2 o 3) */
  @IsOptional()
  @IsInt()
  nEjecutivas?: number;

  /** Controles: distribución base total del grupo */
  @IsOptional()
  @IsNumber()
  dbTotal?: number;

  /** OI: objetivo de evaluaciones por ejecutivo (default 20) */
  @IsOptional()
  @IsInt()
  objEvaluaciones?: number;

  @IsOptional()
  @IsString()
  notas?: string;

  /** Configuración de ejecutivos (meta individual, db, factor) */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PeriodExecutivoDto)
  ejecutivos?: PeriodExecutivoDto[];
}

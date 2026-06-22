import { IsNumber, IsOptional, IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PeriodExecutivoDto } from './period-executivo.dto';

export class UpdatePeriodDto {
  @IsOptional()
  @IsNumber()
  metaMontoConIgv?: number;

  @IsOptional()
  @IsNumber()
  metaMontoSinIgv?: number;

  @IsOptional()
  @IsNumber()
  metaCantidad?: number;

  @IsOptional()
  @IsNumber()
  baseFijaConIgv?: number;

  @IsOptional()
  @IsNumber()
  nEjecutivas?: number;

  @IsOptional()
  @IsNumber()
  dbTotal?: number;

  @IsOptional()
  @IsNumber()
  objEvaluaciones?: number;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsString()
  campusNombre?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PeriodExecutivoDto)
  ejecutivos?: PeriodExecutivoDto[];
}

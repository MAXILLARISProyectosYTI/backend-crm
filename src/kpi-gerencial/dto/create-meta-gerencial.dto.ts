import { IsString, IsOptional, IsNumber, IsDateString, IsBoolean, Min } from 'class-validator';

export class CreateMetaGerencialDto {
  @IsString()
  area: string;

  @IsOptional()
  @IsNumber()
  campusId?: number;

  @IsOptional()
  @IsString()
  campusNombre?: string;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

  @IsNumber()
  @Min(1)
  diasHabiles: number;

  @IsNumber()
  @Min(0)
  metaMonto: number;

  @IsNumber()
  @Min(0)
  metaCantidad: number;

  @IsOptional()
  @IsString()
  moneda?: string;

  @IsOptional()
  @IsString()
  notas?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

import { IsString, IsNumber, IsOptional, MinLength, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateIncidenciaDto {
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  titulo: string;

  @IsString()
  @MinLength(1)
  descripcion: string;

  @IsString()
  tipo: string;

  @IsString()
  prioridad: string;

  @Type(() => Number)
  @IsNumber()
  pacienteId: number;

  @IsString()
  @MaxLength(255)
  pacienteNombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  creadaPor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ejecutivoUsername?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  areaDestino?: string;
}

export class UpdateEstadoDto {
  @IsString()
  estado: string;
}

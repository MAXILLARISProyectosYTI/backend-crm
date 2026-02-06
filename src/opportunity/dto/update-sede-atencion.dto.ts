import { IsInt, IsOptional, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

/** DTO para actualizar solo la sede de atención (campus de atención) de una oportunidad. */
export class UpdateSedeAtencionDto {
  /** ID del campus de atención. null o no enviado para limpiar. */
  @IsOptional()
  @ValidateIf((_o, v) => v != null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  campusAtencionId?: number | null;
}

import { IsInt, Min, Max, IsString, IsIn, IsOptional, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class ComparativoMesQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2030)
  año_inicio: number;

  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2030)
  año_fin: number;

  @IsString()
  @IsIn(['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'])
  mes: string;

  /**
   * Filtro opcional de sedes (mismo formato que en ResumenEvolutivoQueryDto).
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const arr = Array.isArray(value) ? value : String(value).split(',');
    const nums = arr
      .map((v) => Number(String(v).trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    return nums.length ? nums : undefined;
  })
  @IsArray()
  @IsInt({ each: true })
  campus_ids?: number[];
}

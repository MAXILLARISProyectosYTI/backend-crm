import { IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ComparativoQueryDto {
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
}




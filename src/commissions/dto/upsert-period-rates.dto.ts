import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PeriodRateItemDto {
  @IsString()
  typeCode: string;

  @IsNumber()
  amount: number;
}

export class UpsertPeriodRatesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PeriodRateItemDto)
  rates: PeriodRateItemDto[];

  @IsOptional()
  @IsNumber()
  bonoPersonalTtosThreshold?: number;

  @IsOptional()
  @IsNumber()
  bonoPersonalAmount?: number;

  @IsOptional()
  @IsNumber()
  bonoEquipoTtosThreshold?: number;

  @IsOptional()
  @IsNumber()
  bonoEquipoAmount?: number;

  @IsOptional()
  @IsNumber()
  porcentajeComisionOi?: number;
}

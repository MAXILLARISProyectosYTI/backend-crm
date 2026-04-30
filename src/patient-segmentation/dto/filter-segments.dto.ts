import { IsEnum, IsInt, IsOptional, IsPositive, Max, Min } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum SegmentType {
  ACTIVO    = 'ACTIVO',
  EN_RIESGO = 'EN_RIESGO',
  INACTIVO  = 'INACTIVO',
  CRITICO   = 'CRITICO',
  EN_ESPERA = 'EN_ESPERA',
}

export class FilterSegmentsDto {
  @IsOptional()
  @IsEnum(SegmentType)
  segment?: SegmentType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minDaysWithoutAttention?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxDaysWithoutAttention?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  hasFutureAppointment?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  controllerExecutiveId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  companyId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

import { IsArray, IsBoolean, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SedeApoyoItemDto {
  @IsString()
  userId: string;

  @IsNumber()
  campusId: number;

  @IsNumber()
  porcentaje: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpsertSedeApoyoDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SedeApoyoItemDto)
  items: SedeApoyoItemDto[];
}

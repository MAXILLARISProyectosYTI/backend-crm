import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class TagClosureDto {
  @IsInt()
  contractId: number;

  @IsOptional()
  @IsInt()
  quotationId?: number;

  @IsOptional()
  @IsInt()
  periodId?: number;

  @IsOptional()
  @IsEnum(['MISMO_DIA', 'DIFERIDO'])
  timing?: 'MISMO_DIA' | 'DIFERIDO';

  @IsOptional()
  @IsEnum(['DOBLE', 'MAS_50'])
  modifier?: 'DOBLE' | 'MAS_50';

  @IsOptional()
  @IsString()
  notas?: string;
}

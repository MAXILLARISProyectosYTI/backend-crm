import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListPacientesQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  todayOnly?: string;

  @IsOptional()
  @IsIn(['todos', 'fisico', 'digital', 'sin_contrato'])
  contractType?: 'todos' | 'fisico' | 'digital' | 'sin_contrato';
}

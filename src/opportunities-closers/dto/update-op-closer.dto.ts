import { IsString, IsBoolean, IsOptional, IsDateString, IsEnum, IsNumber } from 'class-validator';
import { statesCRM } from './enum-types.enum';
import type { StatesCRM } from './enum-types.enum';

export class UpdateOpCloserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  dateStart?: string;

  @IsOptional()
  @IsDateString()
  dateEnd?: string;

  @IsOptional()
  @IsBoolean()
  isAllDay?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dateStartDate?: string;

  @IsOptional()
  @IsDateString()
  dateEndDate?: string;

  @IsOptional()
  @IsDateString()
  streamUpdatedAt?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  parentType?: string;

  @IsOptional()
  @IsString()
  createdById?: string;

  @IsOptional()
  @IsString()
  modifiedById?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  estado?: string;

  @IsOptional()
  @IsString()
  hCPatient?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  cotizacionId?: string;

  @IsOptional()
  @IsString()
  facturaId?: string;

  @IsOptional()
  @IsString()
  reasonLost?: string;

  @IsOptional()
  @IsString()
  subReasonLost?: string;

  @IsOptional()
  @IsString()
  quotationsDetails?: string;

  @IsOptional()
  @IsString()
  contractId?: string;

  @IsOptional()
  @IsString()
  opportunityId?: string;
}
   

export class UpdateQueueOpClosersDto {

  @IsOptional()
  @IsEnum(statesCRM)
  status_asignamento?: StatesCRM;

  @IsOptional()
  @IsString()
  user_assigned_id?: string;

  @IsOptional()
  @IsBoolean()
  status_borrado?: boolean;
}
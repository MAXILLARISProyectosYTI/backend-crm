import { IsOptional, IsString, IsBoolean, IsDateString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateMeetingDto {

    @IsOptional()
    @IsString()
    @MaxLength(17)
    id?: string;
  
    @IsOptional()
    @IsString()
    @MaxLength(255)
    name?: string;
  
    @IsOptional()
    @IsBoolean()
    deleted?: boolean;
  
    @IsOptional()
    @IsString()
    @MaxLength(255)
    status?: string;
  
    @IsOptional()
    @IsDateString()
    @Type(() => Date)
    dateStart?: Date;
  
    @IsOptional()
    @IsDateString()
    @Type(() => Date)
    dateEnd?: Date;
  
    @IsOptional()
    @IsBoolean()
    isAllDay?: boolean;
  
    @IsOptional()
    @IsString()
    description?: string;
  
    @IsOptional()
    @IsString()
    @MaxLength(255)
    uid?: string;
  
    @IsOptional()
    @IsString()
    joinUrl?: string;
  
    @IsOptional()
    @IsDateString()
    @Type(() => Date)
    createdAt?: Date;
  
    @IsOptional()
    @IsDateString()
    @Type(() => Date)
    modifiedAt?: Date;
  
    @IsOptional()
    @IsDateString()
    @Type(() => Date)
    dateStartDate?: Date;
  
    @IsOptional()
    @IsDateString()
    @Type(() => Date)
    dateEndDate?: Date;
  
    @IsOptional()
    @IsDateString()
    @Type(() => Date)
    streamUpdatedAt?: Date;
  
    @IsOptional()
    @IsString()
    @MaxLength(17)
    parentId?: string;
  
    @IsOptional()
    @IsString()
    @MaxLength(100)
    parentType?: string;
  
    @IsOptional()
    @IsString()
    @MaxLength(17)
    accountId?: string;
  
    @IsOptional()
    @IsString()
    @MaxLength(17)
    createdById?: string;
  
    @IsOptional()
    @IsString()
    @MaxLength(17)
    modifiedById?: string;
  
    @IsOptional()
    @IsString()
    @MaxLength(17)
    assignedUserId?: string;
}

import { IsString, IsBoolean, IsOptional, IsEmail } from 'class-validator';

export class CreateUserDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;

  @IsOptional()
  @IsString()
  userName?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  authMethod?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  salutationName?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  avatarColor?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsOptional()
  @IsString()
  deleteId?: string;

  @IsOptional()
  @IsString()
  defaultTeamId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  avatarId?: string;

  @IsOptional()
  @IsString()
  createdById?: string;

  @IsOptional()
  @IsString()
  dashboardTemplateId?: string;

  @IsOptional()
  @IsString()
  workingTimeCalendarId?: string;

  @IsOptional()
  @IsString()
  layoutSetId?: string;

  @IsOptional()
  @IsString()
  cUsersv?: string;

  @IsOptional()
  @IsString()
  cContraseaSv?: string;

  @IsOptional()
  @IsBoolean()
  cOcupado?: boolean;

  @IsOptional()
  @IsBoolean()
  cCBusy?: boolean;

  @IsOptional()
  @IsBoolean()
  cBusy?: boolean;
}

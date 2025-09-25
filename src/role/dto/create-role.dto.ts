import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;

  @IsOptional()
  @IsString()
  assignmentPermission?: string;

  @IsOptional()
  @IsString()
  userPermission?: string;

  @IsOptional()
  @IsString()
  messagePermission?: string;

  @IsOptional()
  @IsString()
  portalPermission?: string;

  @IsOptional()
  @IsString()
  groupEmailAccountPermission?: string;

  @IsOptional()
  @IsString()
  exportPermission?: string;

  @IsOptional()
  @IsString()
  massUpdatePermission?: string;

  @IsOptional()
  @IsString()
  dataPrivacyPermission?: string;

  @IsOptional()
  @IsString()
  followerManagementPermission?: string;

  @IsOptional()
  @IsString()
  auditPermission?: string;

  @IsOptional()
  @IsString()
  mentionPermission?: string;

  @IsOptional()
  @IsString()
  userCalendarPermission?: string;

  @IsOptional()
  @IsString()
  data?: string;

  @IsOptional()
  @IsString()
  fieldData?: string;
}

import { IsString, IsNumber, IsBoolean, IsOptional, IsDateString, IsArray, IsNotEmpty } from 'class-validator';

export class CreateOpportunityDto {

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  phoneNumber: string;

  @IsNotEmpty()
  @IsString()
  campaignId: string;

  @IsNotEmpty()
  @IsString()
  subCampaignId: string;

  @IsNotEmpty()
  @IsString()
  channel: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  observation?: string;

  @IsOptional()
  files?: Express.Multer.File[];

  @IsNotEmpty()
  @IsString()
  usernameSv?: string;

  @IsNotEmpty()
  @IsString()
  passwordSv?: string;
}

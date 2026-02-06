import { IsString, IsNumber, IsOptional, IsNotEmpty, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

/** Empresa (para metadata por sede) */
export class CreateOpportunityCompanyDto {
  @IsNumber()
  id: number;
  @IsString()
  code: string;
  @IsString()
  name: string;
}

/** Empresa por defecto: Lima / Sede de Miraflores (id: 1, code: L) */
export const DEFAULT_COMPANY: CreateOpportunityCompanyDto = {
  id: 1,
  code: 'L',
  name: 'Lima',
};

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

  /** Sede (campus) para autoasignación por cola por sede. Obligatorio. Form Data envía string; se transforma a number. */
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  campusId: number;

  /** Empresa de la sede (debe coincidir con el campus). Se guarda en metadata. Si no se envía, se usa DEFAULT_COMPANY (Lima / Sede de Miraflores). */
  @IsOptional()
  @IsObject()
  company?: CreateOpportunityCompanyDto;

  @IsOptional()
  files?: Express.Multer.File[];
}

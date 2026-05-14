import { IsString, IsNumber, IsOptional, IsNotEmpty, IsObject, IsBoolean } from 'class-validator';
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

  /**
   * Flujo SV→CRM "Derivar a OI" para paciente referido: indica que el teléfono
   * pertenece a OTRA HC (la principal) y que el CRM debe crear esta oportunidad
   * como REFERIDA (reusar contactId del principal, sufijo REF-N, vincular al
   * paciente referido por `patientIdOverride` y no al titular del teléfono).
   *
   * Cuando viene `true` se requieren `primaryOpportunityId`, `patientIdOverride`
   * y `referredClinicHistoryCode`.
   */
  @IsOptional()
  @IsBoolean()
  isReferral?: boolean;

  /** UUID de la oportunidad del titular del teléfono (anclaje del referido). */
  @IsOptional()
  @IsString()
  primaryOpportunityId?: string;

  /** ID del paciente referido en SV (`clinic_history.id`). */
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  patientIdOverride?: number;

  /** Código de la HC del referido (`clinic_history.history`). */
  @IsOptional()
  @IsString()
  referredClinicHistoryCode?: string;

  /** Datos del paciente referido (evita un round-trip extra al SV). */
  @IsOptional()
  @IsObject()
  referredPatient?: {
    name?: string;
    lastNameFather?: string;
    lastNameMother?: string;
    documentNumber?: string;
    documentType?: string;
  };

  /**
   * Código de la HC SV del paciente (flujo no-referido). Se persiste como
   * `cClinicHistory` en la oportunidad. Permite que el redirect manager
   * encuentre al paciente directamente por HC sin depender del teléfono.
   */
  @IsOptional()
  @IsString()
  clinicHistoryCode?: string;

  @IsOptional()
  files?: Express.Multer.File[];
}

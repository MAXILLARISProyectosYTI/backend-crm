import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ProcessInvoiceCashbackDto {
  /** invoice_result_body.id en SV */
  @IsInt()
  sourceIrbId: number;

  /** Opcional si se conoce la oportunidad referida en CRM */
  @IsOptional()
  @IsString()
  referredOpportunityId?: string;
}

export class ApplyReferralCashbackDto {
  @IsInt()
  patientId: number;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  currency: 'PEN' | 'USD';

  /** ej. cerradoras, sv-front, agenda-oi */
  @IsOptional()
  @IsString()
  applyContext?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class UpdateReferralCashbackConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  expirationMonths?: number;

  @IsOptional()
  active?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

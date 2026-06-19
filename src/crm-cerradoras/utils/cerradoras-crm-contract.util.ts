import { parsePresaveFirstPaymentDate, parsePresaveLastPaymentDate } from './closer-commission.util';

/** ID sintético cuando no hay contract_id en CRM (evita colisión con IDs SV reales). */
export const CRM_SYNTHETIC_CONTRACT_ID_OFFSET = 10_000_000;

export interface CerradorasCrmPresaveRow {
  quotation_id: number;
  contract_type: string | null;
  payments_count: number | null;
  payment_method: string | null;
  registered_payments: string | null;
  created_at: string | null;
}

export interface CerradorasCrmSolicitudRow {
  quotation_id: number;
  tipo_contrato: string | null;
  fecha_contrato: string | null;
  firma_contrato?: string | null;
  facturado?: boolean | null;
}

export function parseModalidadFromCrmFields(input: {
  tipoContrato?: string | null;
  contractType?: string | null;
  paymentsCount?: number | null;
  paymentMethod?: string | null;
}): { modalidad: 'CONTADO' | 'CUOTAS'; cuotaNum: number } | null {
  const candidates = [
    input.tipoContrato,
    input.paymentMethod,
    input.contractType,
    input.paymentsCount != null ? String(input.paymentsCount) : null,
  ].filter(Boolean) as string[];

  for (const raw of candidates) {
    const parsed = parseModalidadToken(raw);
    if (parsed) return parsed;
  }
  return null;
}

function parseModalidadToken(raw: unknown): { modalidad: 'CONTADO' | 'CUOTAS'; cuotaNum: number } | null {
  const text = String(raw ?? '').trim().toLowerCase();
  if (!text) return null;
  if (text.includes('contado')) return { modalidad: 'CONTADO', cuotaNum: 1 };
  const match = text.match(/(\d+)/);
  const n = match ? parseInt(match[1], 10) : 0;
  if (n >= 1 && n <= 14) return { modalidad: 'CUOTAS', cuotaNum: n };
  if (text === '1') return { modalidad: 'CONTADO', cuotaNum: 1 };
  return null;
}

export function mapTratamientoFromCrm(input: {
  subCampaignName?: string | null;
  contractType?: string | null;
}): string {
  const fromCampaign = (input.subCampaignName ?? '').toUpperCase();
  if (fromCampaign === 'APNEA') return 'APNEA';
  if (fromCampaign === 'MARPE') return 'MARPE';
  if (fromCampaign === 'OFM' || fromCampaign === 'OI') return 'OFM';

  const fromContract = (input.contractType ?? '').toUpperCase();
  if (fromContract === 'APNEA') return 'APNEA';
  if (fromContract === 'MARPE') return 'MARPE';
  return 'OFM';
}

/** Tratamiento desde treatment_code SV (contrato OFM/MARPE/APNEA). */
export function mapTratamientoFromTreatmentCode(treatmentCode?: string | null): string | null {
  const code = (treatmentCode ?? '').toUpperCase();
  if (!code) return null;
  if (code.includes('APNEA') || code.includes('CAPNEA')) return 'APNEA';
  if (code.includes('MARPE')) return 'MARPE';
  if (code.includes('OFM') || code.includes('ALINEADOR')) return 'OFM';
  return null;
}

export function resolveCrmContractId(
  contractIdRaw: string | null | undefined,
  quotationId: number,
): number {
  const fromCrm = parseInt(String(contractIdRaw ?? ''), 10);
  if (!Number.isNaN(fromCrm) && fromCrm > 0) return fromCrm;
  return CRM_SYNTHETIC_CONTRACT_ID_OFFSET + quotationId;
}

export function closerInCommissionMonth(
  start: string,
  end: string,
  dates: Array<string | null | undefined>,
): boolean {
  const days = dates
    .map((d) => (d ? String(d).slice(0, 10) : null))
    .filter(Boolean) as string[];
  return days.some((d) => d >= start && d <= end);
}

export function buildCrmCommissionDates(input: {
  dateEnd?: string | null;
  fechaContrato?: string | null;
  presaveCreatedAt?: string | null;
  registeredPayments?: string | null;
}): {
  contractDate: string;
  firstPaymentDate: string | null;
  monthDates: Array<string | null | undefined>;
} {
  const presaveFirstPay = parsePresaveFirstPaymentDate(input.registeredPayments);
  const presaveLastPay = parsePresaveLastPaymentDate(input.registeredPayments);
  const contractDate =
    input.fechaContrato?.slice(0, 10)
    ?? input.dateEnd?.slice(0, 10)
    ?? presaveLastPay
    ?? presaveFirstPay
    ?? input.presaveCreatedAt?.slice(0, 10)
    ?? new Date().toISOString().slice(0, 10);

  const firstPaymentDate = presaveLastPay ?? presaveFirstPay ?? contractDate;
  const monthDates = [
    input.dateEnd,
    presaveLastPay,
    presaveFirstPay,
    input.fechaContrato,
    input.presaveCreatedAt,
    contractDate,
  ];

  return { contractDate, firstPaymentDate, monthDates };
}

export function indexLatestByQuotation<T extends { quotation_id: number }>(
  rows: T[],
): Map<number, T> {
  const map = new Map<number, T>();
  for (const row of rows) {
    const qId = Number(row.quotation_id);
    if (Number.isNaN(qId)) continue;
    if (!map.has(qId)) map.set(qId, row);
  }
  return map;
}

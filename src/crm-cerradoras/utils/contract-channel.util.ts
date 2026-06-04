/**
 * Clasificación físico / digital según fecha de producción DocuSeal.
 * Configurable con DOCUSEAL_PRODUCTION_DATE (YYYY-MM-DD), default 2026-05-22.
 */
export type ContractChannel = 'digital' | 'fisico' | 'sin_contrato';

export type ContractTypeFilter = 'todos' | ContractChannel;

export function getDocusealProductionCutover(): Date {
  const raw = process.env.DOCUSEAL_PRODUCTION_DATE || '2026-05-22';
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? new Date('2026-05-22T00:00:00') : d;
}

export function hasContractEvidence(input: {
  contractId?: string | null;
  hasSvContract?: boolean;
}): boolean {
  return (
    !!(input.contractId && String(input.contractId).trim()) ||
    !!input.hasSvContract
  );
}

/** Fecha de referencia: contrato en SV, si no existe la creación de la oportunidad cerradora. */
export function getContractChannelReferenceDate(input: {
  contractDate?: Date | string | null;
  createdAt?: Date | string | null;
}): Date | null {
  if (input.contractDate != null) {
    const d = new Date(input.contractDate);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (input.createdAt != null) {
    const d = new Date(input.createdAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Digital: tiene contrato y fecha (contrato u oportunidad) >= corte DocuSeal.
 * Físico: tiene contrato y fecha < corte.
 * Sin contrato: sin evidencia de contrato en CRM/SV.
 */
export function resolveContractChannel(input: {
  createdAt?: Date | string | null;
  contractDate?: Date | string | null;
  hasDigitalContractFlag?: boolean | null;
  contractId?: string | null;
  hasSvContract?: boolean;
}): { channel: ContractChannel; hasDigitalContract: boolean } {
  if (!hasContractEvidence(input)) {
    return { channel: 'sin_contrato', hasDigitalContract: false };
  }

  const cutover = getDocusealProductionCutover();
  const refDate = getContractChannelReferenceDate(input);

  const isDigitalByDate =
    refDate != null && refDate.getTime() >= cutover.getTime();
  const isDigital =
    input.hasDigitalContractFlag === true || isDigitalByDate;

  if (isDigital) {
    return { channel: 'digital', hasDigitalContract: true };
  }
  return { channel: 'fisico', hasDigitalContract: false };
}

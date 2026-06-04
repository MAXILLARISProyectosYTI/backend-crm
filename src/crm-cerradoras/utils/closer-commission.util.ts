/** Cierre ganado en CRM cerradoras. */
export function isCloserWinStatus(status?: string | null): boolean {
  const s = (status ?? '').toLowerCase();
  return s === 'ganado' || s === 'cierre ganado' || s === 'win';
}

/** Evidencia de que la cerradora gestionó el caso (anula el plazo de 24 h). */
export function hasCloserGestionEvidence(input: {
  isPresaved?: boolean;
  hasContractPresave?: boolean;
  firmaContrato?: 'pendiente' | 'firmado' | 'rechazado' | null;
  facturado?: boolean;
  facturaId?: string | null;
  hasRegisteredPayment?: boolean;
}): boolean {
  if (input.isPresaved) return true;
  if (input.hasContractPresave) return true;
  if (input.firmaContrato === 'firmado') return true;
  if (input.facturado) return true;
  if (input.facturaId && String(input.facturaId).trim()) return true;
  if (input.hasRegisteredPayment) return true;
  return false;
}

/**
 * Comisionable si cierre ganado y:
 * - hubo gestión (preguardado, contrato firmado o pago mínimo), o
 * - aún dentro de 24 h desde dateEnd, o
 * - demora de comisión aprobada en Solicitudes.
 */
export function isCloserOpportunityCommissionable(input: {
  status?: string | null;
  etapa?: string | null;
  dateEnd?: Date | string | null;
  isPresaved?: boolean;
  hasContractPresave?: boolean;
  firmaContrato?: 'pendiente' | 'firmado' | 'rechazado' | null;
  facturado?: boolean;
  facturaId?: string | null;
  hasRegisteredPayment?: boolean;
  comisionDemoraAprobada?: boolean;
}): boolean {
  const status = input.status ?? input.etapa;
  if (!isCloserWinStatus(status)) return true;

  if (input.comisionDemoraAprobada) return true;
  if (hasCloserGestionEvidence(input)) return true;

  if (!input.dateEnd) return false;
  const winDate = new Date(input.dateEnd);
  if (Number.isNaN(winDate.getTime())) return false;
  const diffHours = (Date.now() - winDate.getTime()) / (1000 * 60 * 60);
  return diffHours <= 24;
}

export function parsePresaveHasRegisteredPayments(
  registeredPayments?: string | null,
): boolean {
  if (!registeredPayments?.trim()) return false;
  try {
    const parsed = JSON.parse(registeredPayments);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

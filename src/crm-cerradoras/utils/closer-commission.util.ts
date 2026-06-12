/** Cierre ganado en CRM cerradoras. */
export function isCloserWinStatus(status?: string | null): boolean {
  const s = (status ?? '').toLowerCase().trim();
  return s === 'ganado' || s === 'cierre ganado' || s === 'win';
}

/** Cierre perdido en CRM cerradoras. */
export function isCloserLostStatus(status?: string | null): boolean {
  const s = (status ?? '').toLowerCase().trim();
  return s === 'perdido' || s === 'cierre perdido' || s === 'lost';
}

/** Cierre terminal: ganado o perdido (no debe reasignarse el usuario). */
export function isCloserTerminalStatus(status?: string | null): boolean {
  return isCloserWinStatus(status) || isCloserLostStatus(status);
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

/** Primer abono registrado en contract_presave (Paso 2 del contrato). */
export function parsePresaveFirstPaymentDate(
  registeredPayments?: string | null,
): string | null {
  if (!registeredPayments?.trim()) return null;
  try {
    const parsed = JSON.parse(registeredPayments);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    let earliest: string | null = null;
    for (const payment of parsed) {
      const raw = payment?.fechaAbono ?? payment?.fecha_abono
        ?? payment?.fechaPago ?? payment?.fecha_pago;
      if (!raw) continue;
      const day = String(raw).slice(0, 10);
      if (!earliest || day < earliest) earliest = day;
    }
    return earliest;
  } catch {
    return null;
  }
}

/** Último abono registrado en contract_presave (regla comisiones cerradoras). */
export function parsePresaveLastPaymentDate(
  registeredPayments?: string | null,
): string | null {
  if (!registeredPayments?.trim()) return null;
  try {
    const parsed = JSON.parse(registeredPayments);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    let latest: string | null = null;
    for (const payment of parsed) {
      const raw = payment?.fechaAbono ?? payment?.fecha_abono
        ?? payment?.fechaPago ?? payment?.fecha_pago;
      if (!raw) continue;
      const day = String(raw).slice(0, 10);
      if (!latest || day > latest) latest = day;
    }
    return latest;
  } catch {
    return null;
  }
}

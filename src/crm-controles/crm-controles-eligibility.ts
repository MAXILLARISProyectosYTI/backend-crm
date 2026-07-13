import type { CrmControlesPatientRow } from './crm-controles.types';

/**
 * Cohorte CRM Controles OFM: control (58) agendado o instalación/moldes (192/121) atendidos.
 * Usar en CRM aunque SV aún no tenga el filtro desplegado.
 */
export function isEligibleCrmControlesPatient(row: CrmControlesPatientRow): boolean {
  const ultima = String(row.ultima_atencion_tipo ?? '').toLowerCase();
  const hasOfmContract =
    Number(row.contrato_total ?? 0) > 0 || Number(row.monto_control ?? 0) > 0;
  const hasOfmCare =
    /control|instalaci|moldes|dispositivo|urgencia/i.test(ultima) &&
    !/^evaluaci/i.test(ultima.trim());
  const evalOnly =
    /evaluaci|apnea|tomograf|\brx\b/i.test(ultima) && !hasOfmCare;

  if (evalOnly && !hasOfmContract) return false;
  if (hasOfmContract || hasOfmCare) return true;
  if (row.is_first_free_control === true) return true;
  return false;
}

export function filterEligibleCrmControlesPatients(
  rows: CrmControlesPatientRow[],
): CrmControlesPatientRow[] {
  return rows.filter(isEligibleCrmControlesPatient);
}

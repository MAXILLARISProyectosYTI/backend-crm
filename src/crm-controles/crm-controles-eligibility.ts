import type { CrmControlesPatientRow } from './crm-controles.types';

/**
 * Todo paciente en union_doctor_patient con id_status_borrado = 2 es elegible.
 * El SV ya garantiza que solo llegan los correctos.
 */
export function isEligibleCrmControlesPatient(_row: CrmControlesPatientRow): boolean {
  return true;
}

export function filterEligibleCrmControlesPatients(
  rows: CrmControlesPatientRow[],
): CrmControlesPatientRow[] {
  return rows.filter(isEligibleCrmControlesPatient);
}

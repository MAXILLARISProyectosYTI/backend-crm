import { DateTime } from 'luxon';

export type PacientesPanelFilters = {
  filterAssignedUserId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  todayOnly?: boolean;
};

/** Clave de agrupación: historia clínica → nombre → id de oportunidad. */
export const PACIENTE_PANEL_KEY_SQL = `COALESCE(NULLIF(TRIM(op.h_c_patient), ''), 'name:' || LOWER(TRIM(op.name)), 'id:' || op.id)`;

export function buildPacientesPanelWhere(
  filters: PacientesPanelFilters,
): { whereSql: string; params: unknown[] } {
  const params: unknown[] = [];
  let idx = 1;
  const clauses = ['op.deleted = false'];

  if (filters.filterAssignedUserId) {
    clauses.push(`op.assigned_user_id = $${idx++}`);
    params.push(filters.filterAssignedUserId);
  }

  if (filters.search?.trim()) {
    const words = filters.search.trim().split(/\s+/).filter(Boolean);
    for (const word of words) {
      const normalized = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      clauses.push(
        `(op.name ILIKE $${idx} OR op.name ILIKE $${idx + 1} OR op.h_c_patient ILIKE $${idx} OR op.h_c_patient ILIKE $${idx + 1})`,
      );
      params.push(`${normalized}%`, `% ${normalized}%`);
      idx += 2;
    }
  }

  if (filters.todayOnly) {
    const todayStart = DateTime.now().setZone('America/Lima').startOf('day').toJSDate();
    const todayEnd = DateTime.now().setZone('America/Lima').endOf('day').toJSDate();
    clauses.push(`LOWER(TRIM(op.status)) IN ('ganado', 'cierre ganado', 'win')`);
    clauses.push('op.date_end IS NOT NULL');
    clauses.push(
      `(op.date_end BETWEEN $${idx} AND $${idx + 1} OR (op.date_end + INTERVAL '24 hours') BETWEEN $${idx} AND $${idx + 1})`,
    );
    params.push(todayStart, todayEnd);
    idx += 2;
  } else {
    if (filters.dateFrom) {
      clauses.push(`op.created_at >= $${idx++}`);
      params.push(new Date(`${filters.dateFrom}T00:00:00`));
    }
    if (filters.dateTo) {
      clauses.push(`op.created_at <= $${idx++}`);
      params.push(new Date(`${filters.dateTo}T23:59:59`));
    }
  }

  return { whereSql: clauses.join(' AND '), params };
}

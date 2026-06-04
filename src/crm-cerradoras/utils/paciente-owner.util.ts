/**
 * Una fila por paciente en Mis Pacientes / contratos cerradoras.
 * Si hay gestión (preguardado, firma, pago mínimo, factura), se fija la cerradora que lo gestionó.
 * Si no, se muestra la oportunidad más reciente (última en entrar a gestionar).
 */

import { hasCloserGestionEvidence } from './closer-commission.util';

export type PacientePanelRow = {
  id: string;
  name?: string;
  hCPatient?: string | null;
  createdAt?: Date | string | null;
  modifiedAt?: Date | string | null;
  facturado?: boolean;
  isPresaved?: boolean;
  facturaId?: string | null;
  firmaContrato?: 'pendiente' | 'firmado' | 'rechazado' | null;
  hasContractPresave?: boolean;
  hasRegisteredPayment?: boolean;
  assignedUserName?: string | null;
  comisionDemoraAprobada?: boolean;
};

export function getPatientGroupKey(row: PacientePanelRow): string {
  const hc = row.hCPatient?.trim();
  if (hc) return `hc:${hc.toLowerCase()}`;
  const name = row.name?.trim().toLowerCase();
  if (name) return `name:${name}`;
  return `id:${row.id}`;
}

function rowTimestamp(row: PacientePanelRow): number {
  const raw = row.createdAt ?? row.modifiedAt;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function isOwnerLocked(row: PacientePanelRow): boolean {
  return hasCloserGestionEvidence({
    isPresaved: row.isPresaved,
    hasContractPresave: row.hasContractPresave,
    firmaContrato: row.firmaContrato,
    facturado: row.facturado,
    facturaId: row.facturaId,
    hasRegisteredPayment: row.hasRegisteredPayment,
  });
}

function pickRepresentative(rows: PacientePanelRow[]): PacientePanelRow {
  const locked = rows.filter(isOwnerLocked);
  if (locked.length > 0) {
    return locked.reduce((best, cur) =>
      rowTimestamp(cur) >= rowTimestamp(best) ? cur : best,
    );
  }
  const conDemoraAprobada = rows.filter((r) => r.comisionDemoraAprobada);
  const pool = conDemoraAprobada.length > 0 ? conDemoraAprobada : rows;
  return pool.reduce((best, cur) =>
    rowTimestamp(cur) >= rowTimestamp(best) ? cur : best,
  );
}

export function dedupeOpportunitiesByPatient<T extends PacientePanelRow>(
  rows: T[],
): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = getPatientGroupKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return Array.from(groups.values()).map((g) => pickRepresentative(g) as T);
}

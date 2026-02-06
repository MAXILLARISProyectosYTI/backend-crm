/**
 * Formatea "hace cuánto tiempo" desde una fecha en español.
 * Si la fecha es null/undefined devuelve "nunca" o "sin asignaciones".
 */
export function formatHaceCuanto(from: Date | string | null | undefined): string {
  if (from == null) return 'sin asignaciones';
  const date = typeof from === 'string' ? new Date(from) : from;
  if (Number.isNaN(date.getTime())) return 'sin asignaciones';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1) return 'hace un momento';
  if (diffMin < 60) return `hace ${diffMin} min`;
  if (diffH < 24) return `hace ${diffH} h`;
  if (diffD === 1) return 'hace 1 día';
  if (diffD < 30) return `hace ${diffD} días`;
  return `hace ${Math.floor(diffD / 30)} mes(es)`;
}

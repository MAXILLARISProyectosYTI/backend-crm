import moment from 'moment-timezone';

const ZONA_PERU = 'America/Lima';

/** ISO sin Z ni offset (ej. "2026-02-03T21:49:22.000") → interpretar como UTC para evitar hora local del servidor */
const ISO_WITHOUT_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

/**
 * Convierte cualquier fecha a zona horaria Perú (Lima) para la devolución en la API.
 * - Date: se asume instante UTC (como devuelve PostgreSQL timestamptz).
 * - String ISO con Z u offset: instante correcto.
 * - String ISO sin Z ni offset: se interpreta como UTC (evita desfase por hora local del servidor).
 * Devuelve ISO string en hora Perú (-05:00).
 */
export function formatDateToLima(date: Date | string | null | undefined): string | null {
  if (date == null) return null;
  const str = typeof date === 'string' ? date.trim() : null;
  const m =
    str != null && ISO_WITHOUT_OFFSET.test(str)
      ? moment.utc(str)
      : moment(date);
  if (!m.isValid()) return null;
  return m.tz(ZONA_PERU).format();
}

const LIMA_TZ = 'America/Lima';

/** Ventana promocional: 16/06/2026 00:00:00 – 30/06/2026 23:59:59 (hora Lima) */
const WINDOW_START = 20260616000000;
const WINDOW_END = 20260630235959;

function getLimaDateTimeNumber(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LIMA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const v = (type: string) => parts.find((p) => p.type === type)?.value.padStart(2, '0') ?? '00';
  return Number(
    `${v('year')}${v('month')}${v('day')}${v('hour')}${v('minute')}${v('second')}`,
  );
}

export function isApneaCourtesyWindowActive(now: Date = new Date()): boolean {
  const limaNow = getLimaDateTimeNumber(now);
  return limaNow >= WINDOW_START && limaNow <= WINDOW_END;
}

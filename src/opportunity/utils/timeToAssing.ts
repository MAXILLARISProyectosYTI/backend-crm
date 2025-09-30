const isBetween = (
  hours: number,
  minutes: number,
  startHour: number,
  startMinute: number,
  endHour: number,
  endMinute: number
): boolean => {
  const current = hours * 60 + minutes;
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return current >= start && current <= end;
};

// Configuración de horarios
const schedules: Record<number, { startHour: number; startMinute: number; endHour: number; endMinute: number }[]> = {
  1: [ // Lunes
    { startHour: 9, startMinute: 0, endHour: 13, endMinute: 0 },
    { startHour: 15, startMinute: 0, endHour: 18, endMinute: 30 },
  ],
  2: [ // Martes
    { startHour: 9, startMinute: 0, endHour: 13, endMinute: 0 },
    { startHour: 15, startMinute: 0, endHour: 18, endMinute: 30 },
  ],
  3: [ // Miércoles
    { startHour: 9, startMinute: 0, endHour: 13, endMinute: 0 },
    { startHour: 15, startMinute: 0, endHour: 18, endMinute: 30 },
  ],
  4: [ // Jueves
    { startHour: 9, startMinute: 0, endHour: 13, endMinute: 0 },
    { startHour: 15, startMinute: 0, endHour: 18, endMinute: 30 },
  ],
  5: [ // Viernes
    { startHour: 9, startMinute: 0, endHour: 13, endMinute: 0 },
    { startHour: 15, startMinute: 0, endHour: 18, endMinute: 30 },
  ],
  6: [ // Sábado
    { startHour: 8, startMinute: 30, endHour: 13, endMinute: 0 },
  ],
  // 0 (Domingo) no tiene horarios
};

export const timeToAssing = (): boolean => {
  const now = new Date();
  const day = now.getDay(); // 0 = Domingo
  const hours = now.getHours();
  const minutes = now.getMinutes();

  // Si es domingo, no hay horarios
  if (!schedules[day]) return false;

  // Revisar si está dentro de alguna franja
  return schedules[day].some((slot) =>
    isBetween(hours, minutes, slot.startHour, slot.startMinute, slot.endHour, slot.endMinute)
  );
};

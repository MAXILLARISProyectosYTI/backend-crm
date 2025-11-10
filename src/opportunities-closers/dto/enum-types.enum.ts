export const statesCRM = {
  PENDIENTE: 'pending',
  EN_PROGRESO: 'in_progress',
  GANADO: 'win',
  PERDIDO: 'lost',
} as const;

export type StatesCRM = typeof statesCRM[keyof typeof statesCRM];

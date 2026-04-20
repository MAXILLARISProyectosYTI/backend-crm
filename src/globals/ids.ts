export const ROLES_IDS = {
  TEAM_LEADER_COMERCIAL: '6894f4685ace0a117',
  CERRADORA: '689f8b18e1b644be3',
  EJ_COMERCIAL: '6894f49a7f3295edf',
  ASISTENTE_COMERCIAL: '6894f4c0f2dbb0f89',
  /** Rol permitido para coincidencia SV en filtered-users (match-sv-username). */
  MATCH_SV_EXTRA_1: '68a8ebd07c6f944dd',
  MATCH_SV_EXTRA_2: '68a602e03226cbba1',
  CONTROLES: '19d6e050866ecbd5a',
  CONTROLES_LIMA: '19d6e050866ecbd5b',
  CONTROLES_AREQUIPA: '19d6e050866ecbd5c',
} as const;

/** Solo con uno de estos roles (y resto de filtros), match-sv-username responde true. */
export const MATCH_SV_USERNAME_ALLOWED_ROLE_IDS = [
  ROLES_IDS.TEAM_LEADER_COMERCIAL,
  ROLES_IDS.MATCH_SV_EXTRA_1,
  ROLES_IDS.MATCH_SV_EXTRA_2,
  ROLES_IDS.EJ_COMERCIAL,
] as const;

export const TEAMS_IDS = {
  EJ_COMERCIAL: '68a60f243afa8a87f',
  EJ_COMERCIAL_OI: '68a9d71d1cfbeae93',
  EJ_COMERCIAL_APNEA: '68a9d710d5a90f5f4',
  CERRADORAS: '689f8b54206af55dd',
  ASISTENTES_COMERCIALES: '68a8e7ffacdc0f08c',
  TEAM_LEADERS_COMERCIALES: '68a9dfbb0e3b13e33',
  TEAM_TI: '6894c8121f0c00dbf',
  TEAM_OWNER: '68af27c623777dc42',
  TEAM_FIORELLA: '68b75568eb21093ef',
  TEAM_VERONICA: '68b755a5ae3790763',
  TEAM_MICHELL: '68b7559436bfde575',
  TEAM_AREQUIPA: '68b755a5ae3790654',
  EQ_EJECUTIVOS_CONTROLES: '19d6e050866995692',
}

/**
 * IDs de equipo admitidos en `filtered-users`: todos los de `TEAMS_IDS`
 * excepto cerradoras y asistentes comerciales.
 */
export const FILTERED_USERS_TEAM_IDS = (Object.values(TEAMS_IDS) as string[]).filter(
  (teamId) =>
    teamId !== TEAMS_IDS.CERRADORAS &&
    teamId !== TEAMS_IDS.ASISTENTES_COMERCIALES &&
    teamId !== TEAMS_IDS.EQ_EJECUTIVOS_CONTROLES,
);

export const CAMPAIGNS_IDS = {
  OI: '6894ef3da2a2c238f',
  APNEA: '6894ef4b093f180de',
  OFM: '6894e221746ae39ea',
}

/** Nombre legible de cada subcampaña (para respuestas API, ej. users-active) */
export const SUB_CAMPAIGN_NAMES: Record<string, string> = {
  [CAMPAIGNS_IDS.OI]: 'OI',
  [CAMPAIGNS_IDS.OFM]: 'OFM',
  [CAMPAIGNS_IDS.APNEA]: 'APNEA',
}

export const USERS_ID = {
  CRISTIAN_APNEA: '68aca6a8c35e7ddfc',
  AIREN_OI: '68a746b1bf67faf82'
}
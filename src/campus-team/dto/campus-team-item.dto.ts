/** Elemento de la lista GET /campus-team con nombres de sede y equipo */
export interface CampusTeamItemDto {
  campusId: number;
  teamId: string;
  /** Nombre de la sede (desde SV o null si no se pudo resolver) */
  campusName: string | null;
  /** Nombre del equipo (desde tabla team) */
  teamName: string | null;
}

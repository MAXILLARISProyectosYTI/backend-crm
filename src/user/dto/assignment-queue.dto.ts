import { User } from '../user.entity';

/** Un usuario en la cola con su posición y flags */
export interface AssignmentQueueItem {
  user: User;
  position: number;
  isNext: boolean;
  isLastAssigned: boolean;
}

/** Siguiente usuario a asignar (en teoría) */
export interface NextToAssignDto {
  user: User;
  position: number;
}

/** Último usuario al que se asignó una oportunidad en esta cola */
export interface LastAssignedDto {
  user: User;
  position: number;
  assignedAt: string;
  opportunityId?: string;
}

/** Cola de asignación por sede + subcampaña: lista ordenada, siguiente y último asignado */
export interface AssignmentQueueByCampusDto {
  campusId: number;
  subCampaignId: string;
  queue: AssignmentQueueItem[];
  nextToAssign: NextToAssignDto | null;
  lastAssigned: LastAssignedDto | null;
}

// --- Respuesta por sedes: primero por sede, luego dos colas + orden por nombre ---

/** Item de la cola del último asignado (quién fue, número, a qué hora) */
export interface ColaUltimoAsignadoItemDto {
  user: User;
  numero: number;
  /** Nombre del equipo del usuario en esta sede/campaña (ej. "Equipo Fiorella"). */
  teamName?: string | null;
  /** Fecha/hora en zona horaria Perú (America/Lima, -05:00). ISO string. */
  hora: string;
  opportunityId?: string;
}

/** Item de la cola del siguiente (quién es el siguiente, número, hace cuánto no recibe) */
export interface ColaSiguienteItemDto {
  user: User;
  numero: number;
  /** Nombre del equipo del usuario en esta sede/campaña (ej. "Equipo Fiorella"). */
  teamName?: string | null;
  haceCuantoNoRecibe: string;
}

/** Datos adicionales por usuario en la cola ordenada (ej. última vez asignado) */
export interface ColaItemDatosAdicionalesDto {
  /** Última fecha de asignación en zona horaria Perú (America/Lima, -05:00). ISO string. */
  lastAssignedAt: string | null;
  haceCuantoNoRecibe: string;
}

/** Item de la cola ordenada por nombre con datos adicionales */
export interface ColaPorSedeItemDto {
  user: User;
  numero: number;
  /** Nombre del equipo del usuario en esta sede/campaña (ej. "Equipo Fiorella"). */
  teamName?: string | null;
  isNext: boolean;
  isLastAssigned: boolean;
  datosAdicionales: ColaItemDatosAdicionalesDto;
}

/** Una campaña dentro de una sede: dos colas + orden por nombre (ejecutivos por tipo/team leader) */
export interface CampañaEnSedeDto {
  subCampaignId: string;
  /** Nombre legible de la subcampaña (ej. OI, OFM, APNEA) */
  subCampaignName: string;
  colaUltimoAsignado: ColaUltimoAsignadoItemDto[];
  colaSiguiente: ColaSiguienteItemDto[];
  colaOrdenadaPorNombre: ColaPorSedeItemDto[];
}

/** Una sede: dentro tiene campañas, dentro de cada campaña los ejecutivos (colas) */
export interface SedeAssignmentDto {
  campusId: number;
  campusName?: string;
  campañas: CampañaEnSedeDto[];
}

/** Respuesta: orden padre = sede, dentro campañas, dentro ejecutivos por tipo */
export interface AssignmentQueuesBySedeDto {
  sedes: SedeAssignmentDto[];
}

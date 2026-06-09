/** Respuesta alineada con el front (`IncidenciaRemota`). */
export interface IncidenciaRemotaDto {
  id: number;
  titulo: string;
  descripcion: string;
  tipo: string;
  prioridad: string;
  estado: string;
  pacienteId: number;
  pacienteNombre: string;
  creadaPor: string;
  areaDestino: string | null;
  fechaCreacion: string;
  /** true si solo quedó en CRM (sin contrato SV o error de sync). */
  soloCrm?: boolean;
  /** Aviso para el usuario cuando no llegó a Historia clínica SV. */
  mensajeSv?: string;
}

export interface SvIssueJoinRaw {
  id: number;
  patientId: number;
  description?: string;
  createdDate?: string;
  status?: string;
  areas?: number[] | null;
  type?: { id: number; name: string } | null;
  priority?: { id: number; name: string } | null;
  userId?: number;
}

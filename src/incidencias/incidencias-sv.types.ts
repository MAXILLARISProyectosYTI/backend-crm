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
  /** true si solo quedó en CRM (legacy / fallo de sync). */
  soloCrm?: boolean;
  /** Aviso para el usuario cuando no llegó a Historia clínica SV. */
  mensajeSv?: string;
  /** ID del issue en SV cuando la incidencia está en Historia clínica. */
  svIssueId?: number | null;
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

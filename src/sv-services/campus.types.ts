/** Empresa asociada a un campus (sede) */
export interface CampusCompany {
  id: number;
  code: string;
  name: string;
}

/** Respuesta del endpoint GET /campus (SV) */
export interface CampusItem {
  id: number;
  name: string;
  description: string | null;
  inicial_clinic_history: string | null;
  companies: CampusCompany[];
}

/** CampusItem enriquecido con coordenadas locales (para WhatsApp LOCATION header). */
export interface CampusItemWithCoordinates extends CampusItem {
  latitude: number | null;
  longitude: number | null;
}

export type CampusListResponse = CampusItem[];

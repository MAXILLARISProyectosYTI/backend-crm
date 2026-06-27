export interface CreateClinicHistoryCrmDto {
  espoId: string;
  id_payment?: number | null;
  id_reservation?: number | null;
  patientId?: number;
}

export interface UpdateClinicHistoryCrmDto {
  id_payment?: number | null;
  id_reservation?: number | null;
  patientId?: number;
}
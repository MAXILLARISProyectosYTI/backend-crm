export interface CreateClinicHistoryCrmDto {
  espoId: string;
  id_payment?: number;
  id_reservation?: number;
  patientId?: number;
}

export interface UpdateClinicHistoryCrmDto {
  id_payment?: number;
  id_reservation?: number;
  patientId?: number;
}
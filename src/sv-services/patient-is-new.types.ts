/**
 * Respuesta tipada para el CRM al consultar si un paciente es nuevo / asignable.
 * Incluye status, código, mensaje y data con últimos movimientos y si está asignado.
 */

export type PatientIsNewResponseStatus = 'success' | 'error';

/** Códigos de respuesta para el CRM */
export type PatientIsNewResponseCode =
  | 'PACIENTE_NUEVO'
  | 'PACIENTE_ELIMINADO_SIN_DATOS'
  | 'PACIENTE_EXISTE_COMPLETO'
  | 'PACIENTE_EXISTE_SOLO_RESERVA'
  | 'PACIENTE_EXISTE_SOLO_PAGO'
  | 'PACIENTE_EXISTE_MAS_6_MESES'
  | 'PACIENTE_EXISTE_MENOS_6_MESES'
  | 'ERROR';

/** Última reserva de evaluación (si existe) */
export interface LastReservationMovement {
  reservation_id: number;
  reservation_date: string;
  reservation_appointment: string;
  doctor_name: string;
  environment_name: string;
  tariff_name: string;
  since_reservation: string;
  until_reservation: string;
  interval_reservation: number;
  specialty_name: string;
}

/** Último pago/factura asociado (si existe) */
export interface LastPaymentMovement {
  payment_id: number;
  url_invoice_soles: string | null;
  url_invoice_dolares: string | null;
}

/** Datos del paciente desde clinic_history (sin datos sensibles innecesarios) */
export interface PatientSummary {
  id: number;
  history: string;
  name: string;
  lastNameFather: string;
  lastNameMother: string;
  documentNumber: string;
  cellphone: string;
  createdAt: string;
}

/** Registro activo de cliente desde clinic_history_client_data (tabla reciente) */
export interface ClientDataSummary {
  id: number;
  clinic_history_id: number;
  name: string;
  last_name_father: string | null;
  last_name_mother: string | null;
  document_type: string | null;
  document_number: string | null;
  cellphone: string | null;
  email: string | null;
  is_active: boolean;
}

/** Últimos movimientos del paciente (reserva eval y pago) */
export interface LastMovements {
  last_reservation_eval: LastReservationMovement | null;
  last_payment: LastPaymentMovement | null;
}

/** Data que se envía al CRM */
export interface PatientIsNewCrmData {
  /** Siempre se puede asignar (otro flujo puede restringir después) */
  can_assign: true;
  /** Si se considera paciente nuevo para el flujo CRM */
  is_new: boolean;
  /** Si ya está asignado a una oportunidad en clinic_history_crm */
  is_assigned: boolean;
  /** Si tiene datos de evaluación completos (reserva + pago) */
  complete: boolean;
  /** Paciente desde clinic_history (null si no existe o se eliminó) */
  patient: PatientSummary | null;
  /** Datos del cliente desde clinic_history_client_data (tabla reciente), null si no hay */
  client_data: ClientDataSummary | null;
  /** Últimos movimientos: última reserva de evaluación y último pago */
  last_movements: LastMovements;
  /** Reserva de evaluación reciente (últimos 3 meses), si aplica */
  data_reservation: LastReservationMovement | null;
  /** Pago/factura de evaluación asociado, si aplica */
  data_payment: LastPaymentMovement | null;
}

export interface PatientIsNewCrmResponse {
  status: PatientIsNewResponseStatus;
  code: PatientIsNewResponseCode;
  message: string;
  data: PatientIsNewCrmData;
}

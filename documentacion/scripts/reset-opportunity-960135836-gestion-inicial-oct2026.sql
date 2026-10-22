-- Reset oportunidad 960 135 836 → Gestión Inicial (flujo simple OFM, como lead nuevo)
-- CRM espo_id: 1a15ef854504a422f
-- Teléfono: (+51) 960135836 | Campaña OFM | Sede Lima
-- HC SV (referencia, NO se borra en SV): MX125-005725 | clinic_history.id ≈ 26447
-- Motivo (oct-2026): Cierre ganado por error / re-gestionar evaluación y flujo manager_leads.
-- Sentinel FORCE_INITIAL: el redirect trata la opp como gestión inicial sin reutilizar pago/reserva viejos.
--
-- ⚠️ NO ejecutado automáticamente — revisar y commitear/ejecutar en ventana acordada.
-- ⚠️ NO anula facturas/OS/reservas en SV; solo desvincula CRM ↔ flujo. NC/OS huérfanas → finanzas aparte.
--
-- Host CRM/SV prod: 161.132.199.230:5432 | CRM=crm | SV=maxi_dev

-- ========== 0) Diagnóstico previo (solo lectura) ==========
-- CRM
-- SELECT id, name, stage, assigned_user_id, is_presaved, c_clinic_history, c_se_trasf_otro_servi, c_conction_sv
-- FROM opportunity WHERE id = '1a15ef854504a422f';
-- SELECT * FROM opportunity_presave WHERE espo_id = '1a15ef854504a422f';
-- SELECT * FROM opportunity_service_order WHERE opportunity_id = '1a15ef854504a422f';
-- SELECT id, file_name FROM files WHERE parent_id = '1a15ef854504a422f';
-- SV
-- SELECT * FROM clinic_history_crm WHERE espo_id = '1a15ef854504a422f';

-- ========== 1) CRM (base crm) ==========
BEGIN;

UPDATE opportunity
SET
  stage = 'Gestion Inicial',
  last_stage = NULL,
  close_date = NULL,
  amount = NULL,
  c_facturacion_sub_estado = NULL,
  c_seguimientocliente = 'Sin Seguimiento',
  c_seguimiento = false,
  is_presaved = true,
  -- Flujo manager: forzar selector inicial (OFM simple; no isOiDerivedFlow)
  c_se_trasf_otro_servi = 'FORCE_INITIAL',
  c_derived_to_oi = false,
  c_clinic_history = NULL,
  c_c_clinic_history = NULL,
  c_date_reservation = NULL,
  c_fecha_de_reservacion = NULL,
  c_appointment = NULL,
  c_c_appointment = NULL,
  c_ambiente = NULL,
  c_environment = NULL,
  c_doctor_asignado = NULL,
  c_doctor = NULL,
  c_especialidad_de_la_atencion = NULL,
  c_specialty = NULL,
  c_tratamiento = NULL,
  c_tariff = NULL,
  c_c_patientsname = NULL,
  c_c_patient_document = NULL,
  c_customer_document = NULL,
  c_customer_document_type = NULL,
  c_patientsname = NULL,
  c_patients_paternal_last_name = NULL,
  c_patients_maternal_last_name = NULL,
  c_patient_document = NULL,
  c_patient_document_type = NULL,
  c_estados_de_la_gestion_inicial = '["(SIN GESTIONAR)"]',
  c_g_e_s_t_i_o_n_d_e_c_i_t_a_s = '["(SIN GESTIONAR)"]',
  c_c_i_e_r_r_e_g_a_n_a_d_o = '["(SIN GESTIONAR)"]',
  c_s_e_g_u_i_m_i_e_n_t_o = '["(SIN GESTIONAR)"]',
  c_conction_sv = CONCAT(
    'https://crm.maxillaris.pe/manager_leads/?usuario=',
    assigned_user_id,
    '&uuid-opportunity=1a15ef854504a422f&sede=1'
  ),
  modified_at = NOW()
WHERE id = '1a15ef854504a422f'
  AND deleted = false;

UPDATE meeting
SET deleted = true, status = 'Canceled', modified_at = NOW()
WHERE parent_id = '1a15ef854504a422f'
  AND deleted = false;

DELETE FROM files WHERE parent_id = '1a15ef854504a422f';

DELETE FROM opportunity_presave WHERE espo_id = '1a15ef854504a422f';

UPDATE opportunity_service_order
SET
  facturado = false,
  invoice_result_head_id = NULL,
  url_soles = NULL,
  url_dolares = NULL,
  updated_at = NOW()
WHERE opportunity_id = '1a15ef854504a422f';

COMMIT;

-- ========== 2) SV (base maxi_dev) — desvincular flujo CRM (pago/reserva/paciente en chc) ==========
BEGIN;

DELETE FROM clinic_history_crm WHERE espo_id = '1a15ef854504a422f';

-- Alternativa (si prefieren conservar fila espo_id vacía en lugar de DELETE):
-- INSERT INTO clinic_history_crm (espo_id, patient_id, id_payment, id_reservation, created_at, modified_at)
-- VALUES ('1a15ef854504a422f', NULL, NULL, NULL, NOW(), NOW())
-- ON CONFLICT DO NOTHING;
-- UPDATE clinic_history_crm
-- SET patient_id = NULL, id_payment = NULL, id_reservation = NULL, modified_at = NOW()
-- WHERE espo_id = '1a15ef854504a422f';

COMMIT;

-- ========== 3) Verificación post-cambio ==========
-- SELECT id, name, stage, is_presaved, c_se_trasf_otro_servi, c_clinic_history, c_conction_sv
-- FROM opportunity WHERE id = '1a15ef854504a422f';
-- SELECT COUNT(*) FROM clinic_history_crm WHERE espo_id = '1a15ef854504a422f';
--
-- Prueba funcional: abrir c_conction_sv → redirect code 4 (OFM) o flujo inicial;
-- no debe arrastrar id_payment 28415 ni reserva previa (ver diagnostico-boleta-960135836-oct2026.sql).

-- Referencia SV sin tocar (gestionar aparte si aplica):
-- Reserva ~198176 | OS oct-2026 | IRH antiguo id_payment 28415 (Ago-2025 S/100)

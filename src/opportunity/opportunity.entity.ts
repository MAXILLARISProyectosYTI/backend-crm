import { Entity, PrimaryColumn, Column, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Enum_Following, Enum_Stage } from './dto/enums';
import { User } from 'src/user/user.entity';

@Entity('opportunity')
@Index('idx_opportunity_account_id', ['accountId'])
@Index('idx_opportunity_assigned_user', ['assignedUserId', 'deleted'])
@Index('idx_opportunity_stage', ['stage', 'deleted'])
export class Opportunity {
  @PrimaryColumn({ type: 'varchar', length: 17 })
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name?: string;

  @Column({ type: 'boolean', nullable: true, default: false })
  deleted?: boolean;

  @Column({ type: 'double precision', nullable: true })
  amount?: number;

  @Column({ type: 'varchar', length: 255, nullable: true, default: 'Gestion Inicial' })
  stage?: Enum_Stage;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'last_stage' })
  lastStage?: string;

  @Column({ type: 'integer', nullable: true })
  probability?: number;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'lead_source' })
  leadSource?: string;

  @Column({ type: 'date', nullable: true, name: 'close_date' })
  closeDate?: Date;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'created_at' })
  createdAt?: Date;

  @Column({ type: 'timestamp with time zone', nullable: true, name: 'modified_at' })
  modifiedAt?: Date;

  @Column({ type: 'varchar', length: 3, nullable: true, name: 'amount_currency' })
  amountCurrency?: string;

  @Column({ type: 'timestamp', nullable: true, name: 'stream_updated_at' })
  streamUpdatedAt?: Date;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'account_id' })
  accountId?: string;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'contact_id' })
  contactId?: string;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'campaign_id' })
  campaignId?: string;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'created_by_id' })
  createdById?: string;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'modified_by_id' })
  modifiedById?: string;

  @ManyToOne(() => User, (user) => user.id)
  @JoinColumn({ name: 'assigned_user_id' })
  assignedUserId?: User;

  @Column({ type: 'bigint', nullable: true, name: 'version_number' })
  versionNumber?: number;

  @Column({ type: 'text', nullable: true, name: 'c_phone_number' })
  cPhoneNumber?: string;

  @Column({ type: 'text', nullable: true, name: 'c_campaign' })
  cCampaign?: string;

  @Column({ type: 'text', nullable: true, name: 'c_channel' })
  cChannel?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_canal' })
  cCanal?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_numero_de_telefono' })
  cNumeroDeTelefono?: string;

  @Column({ type: 'text', nullable: true, name: 'c_sub_camping' })
  cSubCamping?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_last_name_father' })
  cLastNameFather?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_last_name_mother' })
  cLastNameMother?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_patientsname' })
  cPatientsname?: string;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'c_sub_campaign_id' })
  cSubCampaignId?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_patients_paternal_last_name' })
  cPatientsPaternalLastName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_patients_maternal_last_name' })
  cPatientsMaternalLastName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_customer_document_type' })
  cCustomerDocumentType?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_patient_document_type' })
  cPatientDocumentType?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_patient_document' })
  cPatientDocument?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_customer_document' })
  cCustomerDocument?: string;

  // Campos JSON almacenados como text - pueden deserializarse con JSON.parse()
  @Column({ type: 'text', nullable: true, default: '["-no aplica-"]', name: 'c_tags_o_i' })
  cTagsOI?: string;

  @Column({ type: 'text', nullable: true, default: '["Lead nuevo"]', name: 'c_tags_leads' })
  cTagsLeads?: string;

  @Column({ type: 'text', nullable: true, default: '["-no aplica-"]', name: 'c_tags_sales' })
  cTagsSales?: string;

  @Column({ type: 'text', nullable: true, default: '{}', name: 'c_client_typification' })
  cClientTypification?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_clinic_history' })
  cClinicHistory?: string;

  @Column({ type: 'text', nullable: true, name: 'c_testurl' })
  cTesturl?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'c_conction_sv' })
  cConctionSv?: string;

  @Column({ type: 'timestamp', nullable: true, name: 'c_fecha_de_reservacion' })
  cFechaDeReservacion?: Date;

  @Column({ type: 'text', nullable: true, name: 'c_ambiente' })
  cAmbiente?: string;

  @Column({ type: 'text', nullable: true, name: 'c_doctor_asignado' })
  cDoctorAsignado?: string;

  @Column({ type: 'text', nullable: true, name: 'c_especialidad_de_la_atencion' })
  cEspecialidadDeLaAtencion?: string;

  @Column({ type: 'text', nullable: true, name: 'c_tratamiento' })
  cTratamiento?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_environment' })
  cEnvironment?: string;

  @Column({ type: 'text', nullable: true, name: 'c_appointment' })
  cAppointment?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_doctor' })
  cDoctor?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_specialty' })
  cSpecialty?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_tariff' })
  cTariff?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_date_reservation' })
  cDateReservation?: string;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'c_oportunidad_cerradora_id' })
  cOportunidadCerradoraId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'c_treatment_plan' })
  cTreatmentPlan?: string;

  @Column({ type: 'text', nullable: true, name: 'c_c_clinic_history' })
  cCClinicHistory?: string;

  @Column({ type: 'boolean', nullable: true, default: false, name: 'c_seguimiento' })
  cSeguimiento?: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true, default: 'Sin Seguimiento', name: 'c_seguimientocliente' })
  cSeguimientocliente?: Enum_Following;

  @Column({ type: 'text', nullable: true, name: 'c_obs' })
  cObs?: string;

  // Campos JSON almacenados como text - pueden deserializarse con JSON.parse()
  @Column({ type: 'text', nullable: true, default: '["(SIN GESTIONAR)"]', name: 'c_estados_de_la_gestion_inicial' })
  cEstadosDeLaGestionInicial?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, default: 'OI', name: 'c_se_trasf_otro_servi' })
  cSeTrasfOtroServi?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, default: 'NO DESEA', name: 'c_n_o_d_e_s_e_a_s_e_r_v_i_c_i_o' })
  cNODESEAseRViCiO?: string;

  @Column({ type: 'text', nullable: true, default: '["(SIN GESTIONAR)"]', name: 'c_g_e_s_t_i_o_n_r_e_c_o_n_t_a_c_t_o' })
  cGEstiOnReContActo?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, default: 'OI', name: 'c_g_rtrans_serv' })
  cGRtransServ?: string;

  @Column({ type: 'text', nullable: true, default: '["(SIN GESTIONAR)"]', name: 'c_s_e_g_u_i_m_i_e_n_t_o' })
  cSEGuImIeNto?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, default: 'NO DESEA', name: 'c_n_seg_o_d_e_s_e_a_s_e_r_v_i_c_i_o' })
  cNsegOdesEaseRViCiO?: string;

  @Column({ type: 'text', nullable: true, default: '["(SIN GESTIONAR)"]', name: 'c_g_e_s_t_i_o_n_d_e_c_i_t_a_s' })
  cGEstiOnDeCiTas?: string;

  @Column({ type: 'text', nullable: true, default: '["(SIN GESTIONAR)"]', name: 'c_c_i_e_r_r_e_g_a_n_a_d_o' })
  cCIeRRegAnAdo?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'c_c_conction_sv' })
  cCConctionSv?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_c_patientsname' })
  cCPatientsname?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_c_patient_document' })
  cCPatientDocument?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_c_appointment' })
  cCAppointment?: string;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'c_campaign1_id' })
  cCampaign1Id?: string;

  @Column({ type: 'boolean', nullable: true, default: false, name: 'is_presaved' })
  isPresaved?: boolean;
}

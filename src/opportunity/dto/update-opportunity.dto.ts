import { IsString, IsNumber, IsBoolean, IsOptional, IsDateString, IsIn, IsNotEmpty, IsInt } from 'class-validator';
import { User } from 'src/user/user.entity';

export class UpdateOpportunityDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  deleted?: boolean;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  stage?: string;

  @IsOptional()
  @IsString()
  lastStage?: string;

  @IsOptional()
  @IsNumber()
  probability?: number;

  @IsOptional()
  @IsString()
  leadSource?: string;

  @IsOptional()
  @IsDateString()
  closeDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  amountCurrency?: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: User;

  @IsOptional()
  @IsString()
  cPhoneNumber?: string;

  @IsOptional()
  @IsString()
  cCampaign?: string;

  @IsOptional()
  @IsString()
  cChannel?: string;

  @IsOptional()
  @IsString()
  cCanal?: string;

  @IsOptional()
  @IsString()
  cNumeroDeTelefono?: string;

  @IsOptional()
  @IsString()
  cSubCamping?: string;

  @IsOptional()
  @IsString()
  cLastNameFather?: string;

  @IsOptional()
  @IsString()
  cLastNameMother?: string;

  @IsOptional()
  @IsString()
  cPatientsname?: string;

  @IsOptional()
  @IsString()
  cSubCampaignId?: string;

  @IsOptional()
  @IsString()
  cPatientsPaternalLastName?: string;

  @IsOptional()
  @IsString()
  cPatientsMaternalLastName?: string;

  @IsOptional()
  @IsString()
  cCustomerDocumentType?: string;

  @IsOptional()
  @IsString()
  cPatientDocumentType?: string;

  @IsOptional()
  @IsString()
  cPatientDocument?: string;

  @IsOptional()
  @IsString()
  cCustomerDocument?: string;

  @IsOptional()
  @IsString()
  cTagsOI?: string;

  @IsOptional()
  @IsString()
  cTagsLeads?: string;

  @IsOptional()
  @IsString()
  cTagsSales?: string;

  @IsOptional()
  @IsString()
  cClinicHistory?: string;

  @IsOptional()
  @IsString()
  cTesturl?: string;

  @IsOptional()
  @IsString()
  cConctionSv?: string;

  @IsOptional()
  @IsDateString()
  cFechaDeReservacion?: string;

  @IsOptional()
  @IsString()
  cAmbiente?: string;

  @IsOptional()
  @IsString()
  cDoctorAsignado?: string;

  @IsOptional()
  @IsString()
  cEspecialidadDeLaAtencion?: string;

  @IsOptional()
  @IsString()
  cTratamiento?: string;

  @IsOptional()
  @IsString()
  cEnvironment?: string;

  @IsOptional()
  @IsDateString()
  cAppointment?: string;

  @IsOptional()
  @IsString()
  cDoctor?: string;

  @IsOptional()
  @IsString()
  cSpecialty?: string;

  @IsOptional()
  @IsString()
  cTariff?: string;

  @IsOptional()
  @IsString()
  cDateReservation?: string;

  @IsOptional()
  @IsString()
  cOportunidadCerradoraId?: string;

  @IsOptional()
  @IsString()
  cTreatmentPlan?: string;

  @IsOptional()
  @IsString()
  cCClinicHistory?: string;

  @IsOptional()
  @IsBoolean()
  cSeguimiento?: boolean;

  @IsOptional()
  @IsString()
  cSeguimientocliente?: string;

  @IsOptional()
  @IsString()
  cObs?: string;

  @IsOptional()
  @IsString()
  cEstadosDeLaGestionInicial?: string;

  @IsOptional()
  @IsString()
  cSeTrasfOtroServi?: string;

  @IsOptional()
  @IsString()
  cNODESEAseRViCiO?: string;

  @IsOptional()
  @IsString()
  cGEstiOnReContActo?: string;

  @IsOptional()
  @IsString()
  cGRtransServ?: string;

  @IsOptional()
  @IsString()
  cSEGuImIeNto?: string;

  @IsOptional()
  @IsString()
  cNsegOdesEaseRViCiO?: string;

  @IsOptional()
  @IsString()
  cGEstiOnDeCiTas?: string;

  @IsOptional()
  @IsString()
  cCIeRRegAnAdo?: string;

  @IsOptional()
  @IsString()
  cCConctionSv?: string;

  @IsOptional()
  @IsString()
  cCPatientsname?: string;

  @IsOptional()
  @IsString()
  cCPatientDocument?: string;

  @IsOptional()
  @IsString()
  cCAppointment?: string;

  @IsOptional()
  @IsString()
  cCampaign1Id?: string;

  @IsOptional()
  @IsDateString()
  createdAt?: string;
}



export interface UpdateOpportunityProcces {
  // DATOS CLIENTE
  cLastNameFather?: string;
  cLastNameMother?: string;
  cCustomerDocumentType?: string;
  cCustomerDocument?: string;
  // DATOS PACIENTE
  cPatientsname?: string;
  cPatientsPaternalLastName?: string;
  cPatientsMaternalLastName?: string;
  cPatientDocument?: string;
  cPatientDocumentType?: string;
  cClinicHistory?: string;
  // FACTURAS
  cFacturas?: {
    comprobante_soles: string | null;
    comprobante_dolares: string | null;
  };
  // DATOS DE LA CITA
  cAppointment?: string | null;
  cDateReservation?: string | null;
  cDoctor?: string;
  cEnvironment?: string;
  cSpecialty?: string;
  cTariff?: string;  
  reservationId?: number; // ------> Este campo no existe en el CRM, pero se usa para guardar el id de la reserva en el flujo principal
}

export class ReprogramingReservationDto {

  @IsInt()
  @IsNotEmpty()
  newReservationId: number;

  @IsString()
  @IsNotEmpty()
  cAppointment: string;

  @IsString()
  @IsNotEmpty()
  cDateReservation: string;

  @IsString()
  @IsNotEmpty()
  cDoctor: string;

  @IsString()
  @IsNotEmpty()
  cEnvironment: string;

  @IsString()
  @IsNotEmpty()
  cSpecialty: string;

  @IsString()
  @IsNotEmpty()
  cTariff: string; 
}
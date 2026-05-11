import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DerivationStatus, OpportunityDerivation } from './opportunity-derivation.entity';
import { Opportunity } from 'src/opportunity/opportunity.entity';
import { UserService } from 'src/user/user.service';
import { AssignmentQueueStateService } from 'src/assignment-queue-state/assignment-queue-state.service';
import { ActionHistoryService } from 'src/action-history/action-history.service';
import { ENUM_TARGET_TYPE } from 'src/action-history/dto/enum-target-type';
import { CAMPAIGNS_IDS } from 'src/globals/ids';
import { OpportunityService } from 'src/opportunity/opportunity.service';

@Injectable()
export class OpportunityDerivationService {
  constructor(
    @InjectRepository(OpportunityDerivation)
    private readonly derivationRepository: Repository<OpportunityDerivation>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    private readonly userService: UserService,
    private readonly assignmentQueueStateService: AssignmentQueueStateService,
    private readonly actionHistoryService: ActionHistoryService,
    private readonly opportunityService: OpportunityService,
  ) {}

  async deriveToOi(
    opportunityId: string,
    createdByUserId: string,
  ): Promise<OpportunityDerivation> {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id: opportunityId, deleted: false },
    });

    if (!opportunity) {
      throw new NotFoundException(`Oportunidad ${opportunityId} no encontrada`);
    }

    const subCampaign = opportunity.cSubCampaignId;
    if (subCampaign !== CAMPAIGNS_IDS.OFM && subCampaign !== CAMPAIGNS_IDS.APNEA) {
      throw new BadRequestException(
        'Solo se pueden derivar oportunidades de campaña OFM o APNEA a OI',
      );
    }

    const existing = await this.derivationRepository.findOne({
      where: { opportunityId, status: DerivationStatus.ACTIVE },
    });

    if (existing) {
      throw new ConflictException(
        `La oportunidad ${opportunityId} ya tiene una derivación activa a OI (asignada a ${existing.assignedUserId})`,
      );
    }

    const campusId = opportunity.cCampusId ?? null;

    // Obtener el siguiente ejecutivo OI en cola
    const nextOiUser = await this.userService.getNextUserToAssign(
      CAMPAIGNS_IDS.OI,
      campusId ?? undefined,
    );

    if (!nextOiUser) {
      throw new BadRequestException('No hay ejecutivos OI disponibles para asignar');
    }

    // Registrar la asignación en la cola OI
    if (campusId != null) {
      await this.assignmentQueueStateService.recordAssignment(
        campusId,
        CAMPAIGNS_IDS.OI,
        nextOiUser.id,
        opportunityId,
      );
    }

    // Crear el registro de derivación
    const derivation = this.derivationRepository.create({
      opportunityId,
      derivedTo: 'OI',
      assignedUserId: nextOiUser.id,
      campusId,
      createdById: createdByUserId,
      status: DerivationStatus.ACTIVE,
    });

    const saved = await this.derivationRepository.save(derivation);

    // Marcar la oportunidad con el flag
    await this.opportunityRepository.update(
      { id: opportunityId },
      { cDerivedToOi: true },
    );

    // Registrar en historial de acciones de la oportunidad
    await this.actionHistoryService.addRecord({
      targetId: opportunityId,
      target_type: ENUM_TARGET_TYPE.OPPORTUNITY,
      userId: createdByUserId,
      message: 'Oportunidad derivada a flujo OI',
    });

    return saved;
  }

  async getDerivation(opportunityId: string): Promise<{
    hasDerivation: boolean;
    derivation: OpportunityDerivation | null;
    assignedUser: { id: string; firstName: string; lastName: string; userName: string } | null;
  }> {
    const derivation = await this.derivationRepository.findOne({
      where: { opportunityId, status: DerivationStatus.ACTIVE },
    });

    if (!derivation) {
      return { hasDerivation: false, derivation: null, assignedUser: null };
    }

    let assignedUser: { id: string; firstName: string; lastName: string; userName: string } | null = null;
    try {
      const user = await this.userService.findOne(derivation.assignedUserId);
      assignedUser = {
        id: user.id,
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        userName: user.userName ?? '',
      };
    } catch {
      // usuario no encontrado
    }

    return { hasDerivation: true, derivation, assignedUser };
  }

  async closeDerivation(opportunityId: string): Promise<void> {
    await this.derivationRepository.update(
      { opportunityId, status: DerivationStatus.ACTIVE },
      { status: DerivationStatus.CLOSED },
    );
    await this.opportunityRepository.update(
      { id: opportunityId },
      { cDerivedToOi: false },
    );
  }

  /** Devuelve las oportunidades derivadas a OI asignadas a un ejecutivo OI */
  async getDerivedOpportunitiesForUser(userId: string): Promise<string[]> {
    const derivations = await this.derivationRepository.find({
      where: { assignedUserId: userId, status: DerivationStatus.ACTIVE },
      select: ['opportunityId'],
    });
    return derivations.map((d) => d.opportunityId);
  }

  /**
   * Deriva a OI buscando la oportunidad OFM/APNEA por historia clínica.
   * Marca source='controles' para indicar que la derivación viene del CRM Controles.
   */
  async deriveByClinicHistory(
    clinicHistoryCode: string,
    createdByUserId: string,
  ): Promise<OpportunityDerivation & { assignedUserName: string }> {
    const opportunities = await this.opportunityService.getOpportunityByClinicHistory(clinicHistoryCode);

    const ofmOpp = opportunities.find(
      (o) => o.cSubCampaignId === CAMPAIGNS_IDS.OFM || o.cSubCampaignId === CAMPAIGNS_IDS.APNEA,
    );

    if (!ofmOpp) {
      throw new NotFoundException(
        `No se encontró oportunidad OFM/APNEA vinculada al HC ${clinicHistoryCode}`,
      );
    }

    const derivation = await this.deriveToOi(ofmOpp.id, createdByUserId);

    // Marcar la fuente como 'controles'
    await this.derivationRepository.update({ id: derivation.id }, { source: 'controles' });

    let assignedUserName = derivation.assignedUserId;
    try {
      const user = await this.userService.findOne(derivation.assignedUserId);
      assignedUserName = user.userName ?? `${user.firstName} ${user.lastName}`.trim();
    } catch {
      // usuario no encontrado, se usa el ID como fallback
    }

    return { ...derivation, source: 'controles', assignedUserName };
  }

  /**
   * Verifica si existe una derivación activa para un paciente identificado por su HC.
   */
  async getDerivationByClinicHistory(clinicHistoryCode: string): Promise<{
    hasDerivation: boolean;
    opportunityId: string | null;
    derivation: OpportunityDerivation | null;
    assignedUser: { id: string; firstName: string; lastName: string; userName: string } | null;
  }> {
    const opportunities = await this.opportunityService.getOpportunityByClinicHistory(clinicHistoryCode);

    const ofmOpp = opportunities.find(
      (o) => o.cSubCampaignId === CAMPAIGNS_IDS.OFM || o.cSubCampaignId === CAMPAIGNS_IDS.APNEA,
    );

    if (!ofmOpp) {
      return { hasDerivation: false, opportunityId: null, derivation: null, assignedUser: null };
    }

    const result = await this.getDerivation(ofmOpp.id);
    return { ...result, opportunityId: ofmOpp.id };
  }
}

import { Inject, Injectable, Logger, forwardRef } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { OpportunityService } from "src/opportunity/opportunity.service";
import { SvServices } from "src/sv-services/sv.services";
import { BodyAddOpportunityToQueueDto } from "./dto/queue-assignment-closers";
import { OpportunitiesClosers } from "./opportunities-closers.entity";
import { statesCRM } from "./dto/enum-types.enum";
import { OpportunitiesClosersService } from "./opportunities-closers.service";
import { UserService } from "src/user/user.service";
import { TEAMS_IDS } from "src/globals/ids";
import { UpdateOpCloserDto } from "./dto/update-op-closer.dto";
import { CampusTeamService } from "src/campus-team/campus-team.service";

import { getManagerLeadsBaseUrl } from '../common/utils/manager-leads-base-url';

const MAX_QUOTATIONS_PER_RUN = 500;

@Injectable()
export class OpportunitiesClosersCronsService {

  private readonly logger = new Logger(OpportunitiesClosersCronsService.name);
  private readonly URL_FRONT = getManagerLeadsBaseUrl(process.env.URL_FRONT_MANAGER_LEADS);

  constructor(
    private readonly svServices: SvServices,
    private readonly opportunityService: OpportunityService,
    @Inject(forwardRef(() => OpportunitiesClosersService))
    private readonly opportunitiesClosersService: OpportunitiesClosersService,
    private readonly userService: UserService,
    private readonly campusTeamService: CampusTeamService,
  ) {}

  /**
   * Red de seguridad: el webhook notifyQuotationCreated (SV → CRM) cubre el
   * caso principal en tiempo real. Este cron corre cada 5 min como respaldo
   * para cotizaciones que el webhook no pudo reportar (caída de red, etc.).
   */
  @Cron('*/5 9-21 * * *')
  async loopAddQuotationQueue() {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    let list: { id: number | string; name: string; history: string }[] = [];

    try {
      const res = await this.svServices.getQuotationsAll(tokenSv, {
        page: 1,
        limit: MAX_QUOTATIONS_PER_RUN,
      });
      list = res.data ?? [];
    } catch {
      const fallback = await this.svServices.getQuotationsToday(tokenSv);
      list = Array.isArray(fallback) ? fallback : (fallback?.data ?? []);
    }

    const existingKeys = await this.opportunitiesClosersService.findExistingQuotationKeys(
      list.map((q) => String(q.id)),
    );
    const quotationsToAdd = list.filter((quotation) => {
      const hcSet = existingKeys.get(String(quotation.id));
      if (!hcSet) return true;
      const normalizedHc = quotation.history?.trim();
      return normalizedHc ? !hcSet.has(normalizedHc) : false;
    });

    for (const quotation of quotationsToAdd) {
      const gestiónOpp = await this.opportunityService.findOrSyncGestiónOpportunityByHc(
        quotation.history,
        'system',
      );
      if (!gestiónOpp) {
        this.logger.warn(
          `loopAddQuotationQueue: cotización ${quotation.id} (HC ${quotation.history}) no se pudo encolar — sin oportunidad de gestión resuelta`,
        );
        continue;
      }

      await this.addOpportunityToQueue({
        name: quotation.name,
        history: quotation.history,
        opportunityId: gestiónOpp.id,
        quotationId: typeof quotation.id === 'number' ? quotation.id : parseInt(String(quotation.id), 10) || 0,
        campusAtencionId: gestiónOpp.cCampusAtencionId ?? undefined,
      });
    }
  }

  /**
   * Webhook SV → CRM: cotización recién creada. Misma lógica que loopAddQuotationQueue
   * pero para una sola cotización, sin esperar al próximo tick del cron.
   */
  async notifyQuotationCreated(payload: {
    quotationId: number;
    history: string;
    name: string;
  }): Promise<{ status: 'ok' | 'skipped'; opportunityCloserId?: string; reason?: string }> {
    const history = payload.history?.trim();
    if (!history) {
      return { status: 'skipped', reason: 'Cotización sin historia clínica' };
    }

    const exists = await this.opportunitiesClosersService.existsOpportunityCloserByQuotationId(
      String(payload.quotationId),
      history,
    );
    if (exists) {
      return { status: 'skipped', reason: 'Ya encolada' };
    }

    const gestiónOpp = await this.opportunityService.findOrSyncGestiónOpportunityByHc(
      history,
      'system',
    );
    if (!gestiónOpp) {
      this.logger.warn(
        `notifyQuotationCreated: cotización ${payload.quotationId} (HC ${history}) no se pudo encolar — sin oportunidad de gestión resuelta (el cron de respaldo lo reintentará)`,
      );
      return { status: 'skipped', reason: 'No se pudo resolver oportunidad de gestión para la HC' };
    }

    const result = await this.addOpportunityToQueue({
      name: payload.name,
      history,
      opportunityId: gestiónOpp.id,
      quotationId: payload.quotationId,
      campusAtencionId: gestiónOpp.cCampusAtencionId ?? undefined,
    });
    return { status: 'ok', opportunityCloserId: result.id };
  }

  async addOpportunityToQueue(body: BodyAddOpportunityToQueueDto) {
    const userToAssignId = await this.assignOpportunityToClosers(body.campusAtencionId);

    const payload: Partial<OpportunitiesClosers> = {
      assignedUserId: userToAssignId ?? undefined,
      name: body.name,
      status: statesCRM.PENDIENTE,
      hCPatient: body.history,  
      opportunityId: body.opportunityId,
      cotizacionId: body.quotationId.toString(),
    }

    const create = await this.opportunitiesClosersService.createOpportunityCloser(payload)

    // Actualizar el estado de la oportunidad
    const payloadToUpdate: Partial<UpdateOpCloserDto> = {
      status: statesCRM.EN_PROGRESO,
      url: `${this.URL_FRONT}manager_leads/price?uuid-opportunity=${create.id}&cotizacion=${create.cotizacionId}&usuario=${create.assignedUserId}`,
    }

    
    const response = await this.opportunitiesClosersService.update(create.id, payloadToUpdate, userToAssignId ?? undefined)

    return response;
  }


  async assignOpportunityToClosers(campusAtencionId?: number): Promise<string | null> {
    const usersClosers = await this.userService.getUserByAllTeams([TEAMS_IDS.CERRADORAS]);
    if (usersClosers.length > 0) {
      const orderedUsers = Array.from(
        new Map(
          usersClosers.map((user) => [user.user_id, { id: user.user_id, name: user.user_name ?? '' }]),
        ).values(),
      ).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
      const lastAssigned = await this.opportunitiesClosersService.getLastAssignedOpportunity();
      if (!lastAssigned?.assignedUserId) return orderedUsers[0].id;
      const lastIndex = orderedUsers.findIndex((u) => u.id === lastAssigned.assignedUserId);
      const idx = lastIndex === -1 ? 0 : (lastIndex + 1) % orderedUsers.length;
      return orderedUsers[idx].id;
    }

    if (campusAtencionId != null) {
      const teamIds = await this.campusTeamService.getTeamIdsByCampusId(campusAtencionId);
      if (teamIds.length > 0) {
        const usersInCampus = await this.userService.getUserByAllTeams(teamIds);
        if (usersInCampus.length > 0) {
          const pick = usersInCampus[Math.floor(Math.random() * usersInCampus.length)];
          return pick.user_id;
        }
      }
    }

    const activeUsers = await this.userService.findActiveUsers();
    if (activeUsers.length > 0) {
      const pick = activeUsers[Math.floor(Math.random() * activeUsers.length)];
      return pick.id;
    }
    return null;
  }
}

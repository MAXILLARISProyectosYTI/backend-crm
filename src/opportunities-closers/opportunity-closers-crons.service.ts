import { Injectable } from "@nestjs/common";
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

const MAX_QUOTATIONS_PER_RUN = 500;

@Injectable()
export class OpportunitiesClosersCronsService {

  private readonly URL_FRONT = process.env.URL_FRONT_MANAGER_LEADS;

  constructor(
    private readonly svServices: SvServices,
    private readonly opportunityService: OpportunityService,
    private readonly opportunitiesClosersService: OpportunitiesClosersService,
    private readonly userService: UserService,
    private readonly campusTeamService: CampusTeamService,
  ) {}

  @Cron('0 */1 9-21 * * *')
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

    const quotationsToAdd: { id: number | string; name: string; history: string }[] = [];
    for (const quotation of list) {
      const exists = await this.opportunitiesClosersService.existsOpportunityCloserByQuotationId(String(quotation.id));
      if (!exists) quotationsToAdd.push(quotation);
    }

    for (const quotation of quotationsToAdd) {
      const oportunidades = await this.opportunityService.getOpportunityByClinicHistory(quotation.history);
      if (oportunidades.length === 0) continue;

      const first = oportunidades[0];
      await this.addOpportunityToQueue({
        name: quotation.name,
        history: quotation.history,
        opportunityId: first.id,
        quotationId: typeof quotation.id === 'number' ? quotation.id : parseInt(String(quotation.id), 10) || 0,
        campusAtencionId: first.cCampusAtencionId ?? undefined,
      });
    }
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

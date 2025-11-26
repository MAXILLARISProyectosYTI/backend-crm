import { ConflictException, Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { OpportunityService } from "src/opportunity/opportunity.service";
import { SvServices } from "src/sv-services/sv.services";
import { BodyAddOpportunityToQueueDto, PayloadAddOpportunityToQueueDto } from "./dto/queue-assignment-closers";
import { OpportunitiesClosers } from "./opportunities-closers.entity";
import { statesCRM } from "./dto/enum-types.enum";
import { OpportunitiesClosersService } from "./opportunities-closers.service";
import { UserService } from "src/user/user.service";
import { TEAMS_IDS } from "src/globals/ids";
import { UpdateOpCloserDto } from "./dto/update-op-closer.dto";


@Injectable()
export class OpportunitiesClosersCronsService {

  private readonly URL_FRONT = process.env.URL_FRONT_MANAGER_LEADS;

  constructor(
    private readonly svServices: SvServices,
    private readonly opportunityService: OpportunityService,
    private readonly opportunitiesClosersService: OpportunitiesClosersService,
    private readonly userService: UserService,
  ) {}

  @Cron('0 */1 9-21 * * *')
  async loopAddQuotationQueue() {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    const quotationsToday = await this.svServices.getQuotationsToday(tokenSv);

    // Filtrar solo las cotizaciones que no están agregadas   
    let quotationsToAdd: any[] = [];

    for (const quotation of quotationsToday) {
      const existsOpportunityCloser = await this.opportunitiesClosersService.existsOpportunityCloserByQuotationId(quotation.id);
      if (!existsOpportunityCloser) {
        quotationsToAdd.push(quotation);
      }
    }

    for (const quotation of quotationsToAdd) {

      const oportunidades = await this.opportunityService.getOpportunityByClinicHistory(quotation.history);

      if (oportunidades.length > 0) {

        await this.addOpportunityToQueue({
          name: quotation.name,
          history: quotation.history,
          opportunityId: oportunidades[0].id,
          quotationId: quotation.id,
        }); 

      } 
    }
  }

  async addOpportunityToQueue(body: BodyAddOpportunityToQueueDto) {
    const userToAssignId = await this.assignOpportunityToClosers();

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
      url: `${this.URL_FRONT}manager-leads/price?uuid-opportunity=${create.id}&cotizacion=${create.cotizacionId}&usuario=${create.assignedUserId}`,
    }

    
    const response = await this.opportunitiesClosersService.update(create.id, payloadToUpdate, userToAssignId ?? undefined)

    return response;
  }


    async assignOpportunityToClosers(): Promise<string | null> {
      const usersClosers = await this.userService.getUserByAllTeams([TEAMS_IDS.CERRADORAS]);

      if (usersClosers.length === 0) {
        return null;
      }

      const orderedUsers = Array.from(
        new Map(
          usersClosers.map((user) => [user.user_id, { id: user.user_id, name: user.user_name ?? '' }])
        ).values()
      ).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

      const lastAssignedOpportunity = await this.opportunitiesClosersService.getLastAssignedOpportunity();

      if (!lastAssignedOpportunity?.assignedUserId) {
        return orderedUsers[0].id;
      }

      const lastIndex = orderedUsers.findIndex((user) => user.id === lastAssignedOpportunity.assignedUserId);

      if (lastIndex === -1) {
        return orderedUsers[0].id;
      }

      const nextIndex = (lastIndex + 1) % orderedUsers.length;
      return orderedUsers[nextIndex].id;
    }
  }

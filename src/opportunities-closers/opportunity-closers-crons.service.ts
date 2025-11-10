import { ConflictException, Injectable } from "@nestjs/common";
import { Cron, Interval } from "@nestjs/schedule";
import { OpportunityService } from "src/opportunity/opportunity.service";
import { SvServices } from "src/sv-services/sv.services";
import { BodyAddOpportunityToQueueDto, PayloadAddOpportunityToQueueDto } from "./dto/queue-assignment-closers";
import { OpportunitiesClosers } from "./opportunities-closers.entity";
import { statesCRM } from "./dto/enum-types.enum";
import { OpportunitiesClosersService } from "./opportunities-closers.service";
import { UserService } from "src/user/user.service";
import { TEAMS_IDS } from "src/globals/ids";
import { User } from "src/user/user.entity";
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
    
    const quotationsInQueue = await this.svServices.getQueueAssignmentClosers(tokenSv);
    
    const quotationIdsInQueue = new Set(quotationsInQueue.map(q => q.quotation_id));

    // Filtrar solo las cotizaciones que no están en la cola
    const quotationsToAdd = quotationsToday.filter(q => !quotationIdsInQueue.has(q.id));

    for (const quotation of quotationsToAdd) {

      const oportunidades = await this.opportunityService.getOpportunityByClinicHistory(quotation.history);

      if (oportunidades.length > 0) {

        await this.addOpportunityToQueue({
          name: quotation.name,
          history: quotation.history,
          opportunityId: oportunidades[0].id,
          quotationId: quotation.id,
        }); 

      } else {
      }
    }
  }

  async addOpportunityToQueue(body: BodyAddOpportunityToQueueDto) {
    const payload: Partial<OpportunitiesClosers> = {
      assignedUserId: undefined,
      name: body.name,
      status: statesCRM.PENDIENTE,
      hCPatient: body.history,  
      opportunityId: body.opportunityId,
    }

    const response = await this.opportunitiesClosersService.createOpportunityCloser(payload)

    const payloadToQueue: PayloadAddOpportunityToQueueDto = {
      opportunityId: body.opportunityId,
      quotationId: body.quotationId,
      history: body.history,
      opportunityCloserId: response.id,
    }

    const { tokenSv } = await this.opportunitiesClosersService.getTokenByOpCloser(response.id);

    const responseQueue = await this.svServices.addOpportunityToQueue(payloadToQueue, tokenSv)

    return {
      message: 'Oportunidad agregada a la cola',
      opportunityCRM: response,
      opportunityQueue: responseQueue,
    }
  }


  @Interval(1000)
  async loopAssignedClosers() {

    // Obtener usuarios activos
    const usersActive = await this.userService.findActiveUsers();    
    // Obtener usuarios del team CERRADORAS
    const usersClosers = await this.userService.findByTeam(TEAMS_IDS.CERRADORAS)

    
    // Filtrar solo los usuarios activos que están en el equipo CERRADORAS
    const activeUsersInTeam: User[] = usersClosers.filter(teamUser =>
      usersActive.some(activeUser => activeUser.id === teamUser.id)
    );

    // Filtrar usuarios que no estén ocupados
    const usersDontBusy = activeUsersInTeam.filter(user => !user.cBusy)

    if (usersDontBusy.length === 0) {
      return { message: 'No hay usuarios disponibles para asignar.' };
    }

    const { tokenSv } = await this.svServices.getTokenSvAdmin();

    const opportunity = await this.svServices.getForClosers(tokenSv)

    
    if (opportunity.length <= 0 || !opportunity[0].uuid) {
      return { message: 'No hay oportunidades pendientes en la cola.' };
    }

    const existOpportunity = await this.clearQueue(opportunity[0].uuid)
    if(!existOpportunity) {
      return
    }

    const userWithLessOpportunities = await this.svServices.getUserWithLessOpportunities(tokenSv)

    const userToAssign = await this.userService.findOne(userWithLessOpportunities.id)

    const quotation = await this.svServices.getQuotationByHistory(opportunity[0].clinic_history, tokenSv)


    if (!quotation) {
      throw new ConflictException('No se encontró la cotización.');
    }

    // Actualizar el estado de la oportunidad
    const payload: Partial<UpdateOpCloserDto> = {
      status: statesCRM.EN_PROGRESO,
      assignedUserId: userToAssign.id,
      url: `${this.URL_FRONT}manager-leads/price?uuid-opportunity=${opportunity[0].uuid}&cotizacion=${quotation[0].id_quotation}&usuario=${userToAssign.id}     `,
    }
    
    const response = await this.opportunitiesClosersService.update(opportunity[0].uuid, payload, userToAssign.id)

    await this.userService.updateUserCloserToBusy(userToAssign.id, true)

    await this.svServices.updateQueueAssignmentClosers(opportunity[0].uuid, {
      user_assigned_id: userToAssign.id,
      status_asignamento: statesCRM.EN_PROGRESO,
    }, tokenSv);
  
    return response
  }

  async clearQueue(opportunityId: string): Promise<boolean> {
    const { tokenSv } = await this.svServices.getTokenSvAdmin();
    try {
      await this.opportunitiesClosersService.getOneWithEntity(opportunityId)
      return true;
    } catch (error) {

        await this.svServices.updateQueueAssignmentClosers(opportunityId, {
          status_borrado: true,
        }, tokenSv);

        return false;
      }
    }
  }

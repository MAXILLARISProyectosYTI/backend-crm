import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Opportunity } from './opportunity.entity';
import { OpportunityWebSocketService } from './opportunity-websocket.service';
import { OpportunityWithUser } from './dto/opportunity-with-user';
import { User } from 'src/user/user.entity';
import { UserService } from 'src/user/user.service';
import { CAMPAIGNS_IDS, TEAMS_IDS } from 'src/globals/ids';
import { OpportunityService } from './opportunity.service';
import { UserWithTeam } from 'src/user/dto/user-with-team';
import { Cron } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { Enum_Following } from './dto/enums';
import { DateTime } from 'luxon';

@Injectable()
export class OpportunityCronsService {
  private readonly URL_FRONT_MANAGER_LEADS = process.env.URL_FRONT_MANAGER_LEADS;

  // Mutex para evitar ejecuciones concurrentes del cron job de las 3pm
  private assignmentInProgress = false;

  // Mutex para evitar ejecuciones concurrentes del cron job de reasignación
  private reassignInProgress = false;

  constructor(
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    private readonly websocketService: OpportunityWebSocketService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly opportunityService: OpportunityService,
  ) {}

  @Cron('0 30 9 * * *')
  async runCronAt9AM() {
    console.log('cron de las 9:30am');
    return this.assignUnassignedOpportunitiesDaily();
  }
  
  @Cron('0 0 15 * * *')
  async runCronAt3PM() {
    console.log('cron de las 3:00pm');
    return this.assignUnassignedOpportunitiesDaily();
  }  

  @Cron('*/2 * * * * *')
  async runReassignUser() {
    const now = DateTime.now();
    const hour = now.hour;
    const minute = now.minute;

    // Franja 1: 09:30 - 12:59  (incluye 9:30)
    const morning = (hour === 9 && minute >= 30) || (hour >= 10 && hour < 13);

    // Franja 2: 15:00 - 18:50
    const afternoon = (hour >= 15 && (hour < 18 || (hour === 18 && minute <= 30)));

    if (!morning && !afternoon) {
      // No estamos en ventana válida — no hacemos nada.
      return;
    }

    return this.reassignUser();
  }

  async assignUnassignedOpportunitiesDaily() {
    // Verificar si ya hay una asignación en progreso
    if (this.assignmentInProgress) {
      return;
    }

    this.assignmentInProgress = true;

    try {
      const opportunities = await this.opportunityService.getOpportunitiesNotAssigned();

      console.log(opportunities, 'opportunities')

      if (opportunities.length === 0) {
        return;
      }

      // Tracking local para mantener la rotación durante el bucle
      const lastAssignedUsersBySubcampaign = new Map<string, string>();
      let successCount = 0;
      let errorCount = 0;

      // Procesar oportunidades una por una para evitar problemas de concurrencia
      for (const opportunity of opportunities) {
        try {
          if (opportunity) {
            const nextUserAssigned =
              await this.getNextUserToAssingOpportunityWithTracking(
                opportunity.cSubCampaignId || '',
                lastAssignedUsersBySubcampaign,
              );

            console.log(nextUserAssigned, 'nextUserAssigned')

            if (!nextUserAssigned) {
              console.error(
                `❌ No se pudo obtener usuario para asignar oportunidad ${opportunity.id}`,
              );
              errorCount++;
              continue;
            }

            // Usar transacción para operaciones atómicas
            await this.assignOpportunityWithTransaction(
              opportunity,
              nextUserAssigned,
            );

            // Actualizar tracking local inmediatamente después de asignación exitosa
            lastAssignedUsersBySubcampaign.set(
              opportunity.cSubCampaignId || '',
              nextUserAssigned.id,
            );
            successCount++;
          }
        } catch (error) {
          console.error(
            `❌ Error asignando oportunidad ${opportunity.id}:`,
            error,
          );
          errorCount++;
          // Continuar con la siguiente oportunidad en caso de error
        }
      }
    } catch (error) {
      console.error('❌ Error crítico en el proceso de asignación:', error);
    } finally {
      // Liberar el mutex
      this.assignmentInProgress = false;
    }
  }

  /**
   * Método mejorado que utiliza tracking local para mantener la rotación
   * durante la ejecución del cron job
   */
  async getNextUserToAssingOpportunityWithTracking(
    subCampaignId: string,
    localTracking: Map<string, string>,
  ) {
    try {
      let listUsers =
        await this.userService.getUsersBySubCampaignId(subCampaignId);
      let usersDefault: UserWithTeam[] = [];

      // Si no hay usuarios asignados, se asigna un usuario aleatorio del equipo por defecto
      if (listUsers.length === 0) {
        switch (subCampaignId) {
          case CAMPAIGNS_IDS.OI:
            usersDefault = await this.userService.getUserByAllTeams([
              TEAMS_IDS.EJ_COMERCIAL_OI,
            ]);
            break;
          case CAMPAIGNS_IDS.OFM:
            usersDefault = await this.userService.getUserByAllTeams([
              TEAMS_IDS.TEAM_LEADERS_COMERCIALES,
            ]);
            break;
          case CAMPAIGNS_IDS.APNEA:
            usersDefault = await this.userService.getUserByAllTeams([
              TEAMS_IDS.EJ_COMERCIAL_APNEA,
            ]);
            break;
          default:
            console.error(
              `❌ Subcampaña no reconocida para asignación por defecto: ${subCampaignId}`,
            );
            return null;
        }

        const userSelected =
          usersDefault[Math.floor(Math.random() * usersDefault.length)];
        const userDetails = await this.userService.findOne(
          userSelected.user_id,
        );

        return userDetails;
      }

      // Verificar si ya tenemos un tracking local para esta subcampaña
      const lastAssignedUserId = localTracking.get(subCampaignId);
      let lastOpportunityAssigned: Partial<OpportunityWithUser> | null = null;

      if (lastAssignedUserId) {
        // Usar el tracking local
        const user = await this.userService.findOne(lastAssignedUserId);
        lastOpportunityAssigned = {
          assigned_user_id: lastAssignedUserId,
          assigned_user_user_name: user.userName || '',
        };
      } else {
        // Primera asignación, consultar EspoCRM
        lastOpportunityAssigned =
          await this.opportunityService.getLastOpportunityAssigned(
            subCampaignId,
          );
      }

      if (!lastOpportunityAssigned) {
        return listUsers[0];
      }

      // Usar la función helper que considera el tracking local
      const nextUser = this.getNextUserWithLocalTracking(
        listUsers, 
        lastOpportunityAssigned
      );

      if (!nextUser) {
        console.error(
          `❌ No se pudo determinar el siguiente usuario para subcampaña: ${subCampaignId}`,
        );
        return listUsers[0]; // Fallback al primer usuario
      }

      return nextUser;
    } catch (error) {
      console.error(
        `❌ Error en getNextUserToAssingOpportunityWithTracking para subcampaña ${subCampaignId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Función helper que determina el siguiente usuario usando la lógica de rotación
   * pero considerando el tracking local en lugar de consultar la base de datos
   */
  private getNextUserWithLocalTracking(
    listUsers: User[],
    lastOpportunityAssigned: Partial<OpportunityWithUser>
  ): User | null {
    const lastUserAssigned = lastOpportunityAssigned.assigned_user_id;
    const lastUserAssignedName = lastOpportunityAssigned.assigned_user_user_name;

    // Encontrar el índice del último usuario asignado en la lista ordenada alfabéticamente
    const lastUserIndex = listUsers.findIndex((user) => user.id === lastUserAssigned);
    
    let nextUserIndex = 0; // Por defecto el primer usuario
    
    if (lastUserIndex !== -1) {
      // Si encontramos el usuario en la lista actual, tomar el siguiente
      nextUserIndex = (lastUserIndex + 1) % listUsers.length;
    } else {
      // Si el usuario ya no está en la lista, inferir su posición alfabética
      // basándose en su nombre para determinar quién sería el siguiente
      let inferredPosition = 0;
      
      for (let i = 0; i < listUsers.length; i++) {
        // Comparar alfabéticamente para encontrar dónde estaría el usuario eliminado
        if (lastUserAssignedName && listUsers[i].userName && 
            lastUserAssignedName.localeCompare(listUsers[i].userName || "", "es", { sensitivity: "base" }) < 0) {
          // El usuario eliminado estaría antes que este usuario en la lista
          // Por lo tanto, este usuario actual sería el siguiente en la rotación
          inferredPosition = i;
          break;
        }
        // Si llegamos al final sin encontrar un usuario "mayor", 
        // significa que el usuario eliminado estaría al final, 
        // entonces el siguiente sería el primer usuario (posición 0)
        inferredPosition = 0;
      }
      
      nextUserIndex = inferredPosition;
    }
    
    return listUsers[nextUserIndex];
  }

  /**
   * Método para asignar oportunidad con transacciones atómicas y reintentos
   */
  async assignOpportunityWithTransaction(
    // opportunity: Opportunities,
    opportunity: Opportunity,
    nextUserAssigned: User,
  ) {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 segundo

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Iniciar transacción de base de datos
        await this.opportunityRepository.manager.transaction(
          async (transactionalEntityManager) => {
            try {
              // 1. Actualizar la oportunidad en EspoCRM
              await this.opportunityService.update(opportunity.id, {
                assignedUserId: nextUserAssigned,
                cConctionSv: `${this.URL_FRONT_MANAGER_LEADS}manager_leads/?usuario=${nextUserAssigned.id}&uuid-opportunity=${opportunity.id}`,
              });

              // 3. Enviar notificación al usuario (después de que todo esté guardado)
              try {
                await this.websocketService.notifyOpportunityUpdate(
                  opportunity,
                  nextUserAssigned.id,
                );
              } catch (notificationError) {
                // Si falla la notificación, log el error pero no fallar la transacción
                console.error(
                  `⚠️ Error enviando notificación para oportunidad ${opportunity.id}:`,
                  notificationError,
                );
              }
            } catch (error) {
              console.error(
                `❌ Error en transacción para oportunidad ${opportunity.id} (intento ${attempt}):`,
                error,
              );
              throw error; // Esto causará rollback automático
            }
          },
        );

        // Si llegamos aquí, la transacción fue exitosa
        return;
      } catch (error) {
        if (attempt === maxRetries) {
          console.error(
            `❌ Error definitivo después de ${maxRetries} intentos para oportunidad ${opportunity.id}:`,
            error,
          );
          throw error;
        }

        const delay = baseDelay * Math.pow(2, attempt - 1); // Backoff exponencial
        await this.delay(delay);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async reassignUser() {
    if (this.reassignInProgress) {
      return;
    }

    this.reassignInProgress = true;

    const opportunities = await this.opportunityService.getOpportunitiesNotReaction();

    if (opportunities.length === 0) {
      return;
    }

    try {
      // Tracking local para reasignaciones por subcampaña
      const reassignTracking = new Map<string, string>();
      let reassignCount = 0;

      for (const opportunity of opportunities) {
        const follow = opportunity.cSeguimientocliente;
        // Si sigue sin seguimiento, verificar tiempo transcurrido
        if (follow === Enum_Following.SIN_SEGUIMIENTO) {
          const now = DateTime.now();
          const createdAt = opportunity.modifiedAt 
            ? DateTime.fromJSDate(opportunity.modifiedAt)
            : DateTime.now();
          const minutesElapsed = Math.floor(
            now.diff(createdAt, 'minutes').minutes,
          );

          console.log(`⏰ Oportunidad ${opportunity.id}: ${minutesElapsed} minutos transcurridos desde ${createdAt.toFormat('dd/MM/yyyy HH:mm:ss')}`);

          // Si han pasado más de 10 minutos y tiene usuario asignado, reasignar
          if (minutesElapsed >= 10) {
            try {
              const subCampaignId = opportunity.cSubCampaignId || '';
              const currentAssignedUserId = opportunity.assignedUserId?.id;

              if (!currentAssignedUserId) {
                console.error(
                  `❌ La oportunidad ${opportunity.id} no tiene usuario asignado válido`,
                );
                continue;
              }

              // Obtener la lista de usuarios para esta subcampaña
              const listUsers = await this.userService.getUsersBySubCampaignId(subCampaignId);
              
              if (listUsers.length === 0) {
                console.error(
                  `❌ No hay usuarios disponibles para reasignar oportunidad ${opportunity.id}`,
                );
                continue;
              }

              // Si solo hay un usuario, no reasignar
              if (listUsers.length === 1) {
                console.log(
                  `⚠️ Solo hay un usuario disponible para subcampaña ${subCampaignId}, no se reasigna oportunidad ${opportunity.id}`,
                );
                continue;
              }

              // Usar tracking local para reasignaciones
              const lastReassignedUserId = reassignTracking.get(subCampaignId);
              let nextUserAssigned: User | null = null;

              if (lastReassignedUserId) {
                // Usar el tracking local de reasignaciones
                const lastReassignedUser = await this.userService.findOne(lastReassignedUserId);
                const lastOpportunityAssigned = {
                  assigned_user_id: lastReassignedUserId,
                  assigned_user_user_name: lastReassignedUser.userName || '',
                };
                nextUserAssigned = this.getNextUserWithLocalTracking(
                  listUsers,
                  lastOpportunityAssigned
                );
              } else {
                // Primera reasignación, usar el usuario actual como referencia
                const currentUser = await this.userService.findOne(currentAssignedUserId);
                const lastOpportunityAssigned = {
                  assigned_user_id: currentAssignedUserId,
                  assigned_user_user_name: currentUser.userName || '',
                };
                nextUserAssigned = this.getNextUserWithLocalTracking(
                  listUsers,
                  lastOpportunityAssigned
                );
              }

              if (!nextUserAssigned) {
                console.error(
                  `❌ No se pudo determinar el siguiente usuario para reasignar oportunidad ${opportunity.id}`,
                );
                continue;
              }

              // Verificar que no sea el mismo usuario
              if (nextUserAssigned.id === currentAssignedUserId) {
                console.log(
                  `⚠️ El siguiente usuario en la cola es el mismo que ya tiene la oportunidad ${opportunity.id}, no se reasigna`,
                );
                continue;
              }


              // Actualizar la oportunidad en EspoCRM
              await this.opportunityService.update(opportunity.id, {
                assignedUserId: nextUserAssigned,
                cConctionSv: `${this.URL_FRONT_MANAGER_LEADS}manager_leads/?usuario=${nextUserAssigned.id}&uuid-opportunity=${opportunity.id}`,
              });

              // Actualizar tracking local de reasignaciones
              reassignTracking.set(subCampaignId, nextUserAssigned.id);
              reassignCount++;

              console.log(`✅ Oportunidad reasignada ${opportunity.id} de ${currentAssignedUserId} a ${nextUserAssigned.id} (${minutesElapsed} min sin seguimiento)`);
            } catch (error) {
              console.error(
                `❌ Error al reasignar oportunidad ${opportunity.id}:`,
                error,
              );
            }
          }
        }
      }

      if (reassignCount > 0) {
        console.log(`🔄 Total de reasignaciones realizadas: ${reassignCount} a las ${DateTime.now().toFormat('dd/MM/yyyy HH:mm:ss')}`);
      } else {
        console.log(`ℹ️ No se encontraron oportunidades que requieran reasignación a las ${DateTime.now().toFormat('dd/MM/yyyy HH:mm:ss')}`);
      }
    } finally {
      this.reassignInProgress = false;
    }
  }
}

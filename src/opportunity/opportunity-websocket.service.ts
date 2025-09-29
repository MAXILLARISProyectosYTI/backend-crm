import { Injectable, Logger } from '@nestjs/common';
import { OpportunityGateway } from './opportunity.gateway';
import { Opportunity } from './opportunity.entity';

export interface OpportunityNotification {
  type: 'NEW_OPPORTUNITY' | 'OPPORTUNITY_UPDATED' | 'OPPORTUNITY_DELETED';
  assignedUserId: string;
  opportunity?: Opportunity;
  opportunityId?: string;
  timestamp: string;
  metadata?: {
    stage?: string;
    amount?: number;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
    previousStage?: string;
  };
}

@Injectable()
export class OpportunityWebSocketService {
  private readonly logger = new Logger(OpportunityWebSocketService.name);

  constructor(private readonly opportunityGateway: OpportunityGateway) {}

  /**
   * Notifica a un usuario específico sobre una nueva oportunidad
   */
  async notifyNewOpportunity(opportunity: Opportunity): Promise<void> {
    if (!opportunity.assignedUserId) {
      this.logger.warn('No se puede notificar: opportunity sin assignedUserId');
      return;
    }

    try {
      const isConnected = this.opportunityGateway.isUserConnected(opportunity.assignedUserId.id);
      
      if (!isConnected) {
        this.logger.log(`Usuario ${opportunity.assignedUserId} no está conectado, notificación omitida`);
        return;
      }

      // Determinar prioridad basada en el monto y etapa
      const priority = this.determinePriority(opportunity);
      
      this.opportunityGateway.notifyNewOpportunity(opportunity.assignedUserId.id, opportunity);
      
      this.logger.log(`Notificación de nueva oportunidad enviada al usuario ${opportunity.assignedUserId} (prioridad: ${priority})`);
      
      // Log para auditoría
      await this.logNotification({
        type: 'NEW_OPPORTUNITY',
        assignedUserId: opportunity.assignedUserId.id,
        opportunity,
        timestamp: new Date().toISOString(),
        metadata: {
          stage: opportunity.stage,
          amount: opportunity.amount,
          priority,
        },
      });
      
    } catch (error) {
      this.logger.error(`Error notificando nueva oportunidad: ${error.message}`);
    }
  }

  /**
   * Notifica a un usuario específico sobre la actualización de una oportunidad
   */
  async notifyOpportunityUpdate(opportunity: Opportunity, previousStage?: string): Promise<void> {
    if (!opportunity.assignedUserId) {
      this.logger.warn('No se puede notificar: opportunity sin assignedUserId');
      return;
    }

    try {
      const isConnected = this.opportunityGateway.isUserConnected(opportunity.assignedUserId.id);
      
      if (!isConnected) {
        this.logger.log(`Usuario ${opportunity.assignedUserId} no está conectado, notificación omitida`);
        return;
      }

      // Determinar si el cambio es significativo
      const isSignificantChange = this.isSignificantChange(opportunity, previousStage);
      
      if (!isSignificantChange) {
        this.logger.log(`Cambio no significativo en oportunidad ${opportunity.id}, notificación omitida`);
        return;
      }

      const priority = this.determinePriority(opportunity);
      
      this.opportunityGateway.notifyOpportunityUpdate(opportunity.assignedUserId.id, opportunity);
      
      this.logger.log(`Notificación de actualización enviada al usuario ${opportunity.assignedUserId} (prioridad: ${priority})`);
      
      // Log para auditoría
      await this.logNotification({
        type: 'OPPORTUNITY_UPDATED',
        assignedUserId: opportunity.assignedUserId.id,
        opportunity,
        timestamp: new Date().toISOString(),
        metadata: {
          stage: opportunity.stage,
          amount: opportunity.amount,
          priority,
          previousStage,
        },
      });
      
    } catch (error) {
      this.logger.error(`Error notificando actualización de oportunidad: ${error.message}`);
    }
  }

  /**
   * Notifica a un usuario específico sobre la eliminación de una oportunidad
   */
  async notifyOpportunityDeleted(assignedUserId: string, opportunityId: string): Promise<void> {
    if (!assignedUserId) {
      this.logger.warn('No se puede notificar: assignedUserId requerido');
      return;
    }

    try {
      const isConnected = this.opportunityGateway.isUserConnected(assignedUserId);
      
      if (!isConnected) {
        this.logger.log(`Usuario ${assignedUserId} no está conectado, notificación omitida`);
        return;
      }

      this.opportunityGateway.notifyOpportunityDeleted(assignedUserId, opportunityId);
      
      this.logger.log(`Notificación de eliminación enviada al usuario ${assignedUserId} para oportunidad ${opportunityId}`);
      
      // Log para auditoría
      await this.logNotification({
        type: 'OPPORTUNITY_DELETED',
        assignedUserId,
        opportunityId,
        timestamp: new Date().toISOString(),
      });
      
    } catch (error) {
      this.logger.error(`Error notificando eliminación de oportunidad: ${error.message}`);
    }
  }

  /**
   * Notifica a múltiples usuarios sobre una nueva oportunidad (útil para supervisores)
   */
  async notifyMultipleUsers(userIds: string[], opportunity: Opportunity): Promise<void> {
    const promises = userIds.map(userId => 
      this.notifyNewOpportunity({ ...opportunity, assignedUserId: { id: userId } })
    );
    
    await Promise.allSettled(promises);
    
    this.logger.log(`Notificaciones enviadas a ${userIds.length} usuarios`);
  }

  /**
   * Obtiene estadísticas de conexiones WebSocket
   */
  getConnectionStats() {
    return this.opportunityGateway.getConnectionStats();
  }

  /**
   * Determina la prioridad de una notificación basada en la oportunidad
   */
  private determinePriority(opportunity: Opportunity): 'LOW' | 'MEDIUM' | 'HIGH' {
    // Lógica de prioridad basada en monto y etapa
    const amount = opportunity.amount || 0;
    const stage = opportunity.stage || '';
    
    // Alta prioridad: montos altos o etapas críticas
    if (amount > 10000 || stage.includes('Cerrado') || stage.includes('Urgente')) {
      return 'HIGH';
    }
    
    // Media prioridad: montos medios o etapas importantes
    if (amount > 5000 || stage.includes('Prospecto') || stage.includes('Negociación')) {
      return 'MEDIUM';
    }
    
    // Baja prioridad: resto de casos
    return 'LOW';
  }

  /**
   * Determina si un cambio en la oportunidad es significativo
   */
  private isSignificantChange(opportunity: Opportunity, previousStage?: string): boolean {
    // Cambios significativos:
    // 1. Cambio de etapa
    // 2. Cambio de monto significativo (>10%)
    // 3. Cambio en probabilidad significativo (>20%)
    
    if (previousStage && previousStage !== opportunity.stage) {
      return true;
    }
    
    // Aquí podrías agregar más lógica para detectar cambios significativos
    return true; // Por ahora, notificar todos los cambios
  }

  /**
   * Log de notificaciones para auditoría (podrías guardar en base de datos)
   */
  private async logNotification(notification: OpportunityNotification): Promise<void> {
    // Aquí podrías guardar en una tabla de logs o enviar a un servicio externo
    this.logger.debug(`Notificación registrada: ${JSON.stringify(notification)}`);
    
    // Ejemplo de cómo podrías guardar en base de datos:
    // await this.notificationLogRepository.save({
    //   type: notification.type,
    //   assignedUserId: notification.assignedUserId,
    //   opportunityId: notification.opportunity?.id || notification.opportunityId,
    //   timestamp: new Date(notification.timestamp),
    //   metadata: notification.metadata,
    // });
  }
}

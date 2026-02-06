import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { Opportunity } from './opportunity.entity';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/opportunity',
})
export class OpportunityGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OpportunityGateway.name);
  private userSockets = new Map<string, Set<string>>(); // assignedUserId -> Set<socketId>

  handleConnection(_client: Socket) {}

  handleDisconnect(client: Socket) {
    
    // Remover el socket de todos los usuarios
    for (const [assignedUserId, socketIds] of this.userSockets.entries()) {
      socketIds.delete(client.id);
      if (socketIds.size === 0) {
        this.userSockets.delete(assignedUserId);
      }
    }
  }

  @SubscribeMessage('join-user-room')
  handleJoinUserRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { assignedUserId: string },
  ) {
    const { assignedUserId } = data;
    
    if (!assignedUserId) {
      client.emit('error', { message: 'assignedUserId es requerido' });
      return;
    }

    // Unir al cliente a la sala del usuario
    client.join(`user:${assignedUserId}`);
    
    // Registrar el socket para este usuario
    if (!this.userSockets.has(assignedUserId)) {
      this.userSockets.set(assignedUserId, new Set());
    }
    this.userSockets.get(assignedUserId)!.add(client.id);

    client.emit('joined-user-room', { assignedUserId });
  }

  @SubscribeMessage('leave-user-room')
  handleLeaveUserRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { assignedUserId: string },
  ) {
    const { assignedUserId } = data;
    
    client.leave(`user:${assignedUserId}`);
    
    // Remover el socket del registro
    const socketIds = this.userSockets.get(assignedUserId);
    if (socketIds) {
      socketIds.delete(client.id);
      if (socketIds.size === 0) {
        this.userSockets.delete(assignedUserId);
      }
    }
    
    this.logger.log(`Cliente ${client.id} salió de la sala del usuario ${assignedUserId}`);
    client.emit('left-user-room', { assignedUserId });
  }

  // Método para notificar a un usuario específico sobre una nueva oportunidad
  notifyNewOpportunity(assignedUserId: string, opportunity: Opportunity) {
    this.logger.log(`Notificando nueva oportunidad al usuario ${assignedUserId}`);
    
    this.server.to(`user:${assignedUserId}`).emit('new-opportunity', {
      type: 'NEW_OPPORTUNITY',
      assignedUserId,
      opportunity,
      timestamp: new Date().toISOString(),
    });
  }

  // Método para notificar actualización de oportunidad
  notifyOpportunityUpdate(assignedUserId: string, opportunity: Opportunity) {
    this.logger.log(`Notificando actualización de oportunidad al usuario ${assignedUserId}`);
    
    this.server.to(`user:${assignedUserId}`).emit('opportunity-updated', {
      type: 'OPPORTUNITY_UPDATED',
      assignedUserId,
      opportunity,
      timestamp: new Date().toISOString(),
    });
  }

  // Método para notificar eliminación de oportunidad
  notifyOpportunityDeleted(assignedUserId: string, opportunityId: string) {
    this.logger.log(`Notificando eliminación de oportunidad al usuario ${assignedUserId}`);
    
    this.server.to(`user:${assignedUserId}`).emit('opportunity-deleted', {
      type: 'OPPORTUNITY_DELETED',
      assignedUserId,
      opportunityId,
      timestamp: new Date().toISOString(),
    });
  }

  // Método para obtener usuarios conectados
  getConnectedUsers(): string[] {
    return Array.from(this.userSockets.keys());
  }

  // Método para verificar si un usuario está conectado
  isUserConnected(assignedUserId: string): boolean {
    return this.userSockets.has(assignedUserId) && this.userSockets.get(assignedUserId)!.size > 0;
  }

  // Método para obtener estadísticas de conexiones
  getConnectionStats() {
    return {
      totalUsers: this.userSockets.size,
      totalConnections: Array.from(this.userSockets.values()).reduce(
        (total, sockets) => total + sockets.size,
        0,
      ),
      users: Array.from(this.userSockets.keys()),
    };
  }
}

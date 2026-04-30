import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

/**
 * Gateway WebSocket para notificaciones CRM en tiempo real.
 * Namespace: /notificaciones
 *
 * Evento emitido → 'notif-update': { newCount: number; timestamp: string }
 * El frontend escucha este evento y re-fetcha la lista REST para mantenerse sincronizado.
 */
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/notificaciones',
})
export class NotificacionesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificacionesGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Notif WS conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Notif WS desconectado: ${client.id}`);
  }

  /**
   * Notifica a TODOS los clientes conectados que hay nuevas notificaciones.
   * No envía el payload completo — solo la señal para que el frontend re-fetche.
   */
  broadcast(newCount: number): void {
    this.server.emit('notif-update', {
      newCount,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`[notif-update] broadcast → ${newCount} nueva(s)`);
  }

  /**
   * Notifica a TODOS los clientes conectados que se asignaron pacientes de controles.
   * El frontend escucha 'controles-updated' y re-fetcha el listado de pacientes.
   */
  broadcastControlesUpdated(assignedCount: number): void {
    this.server.emit('controles-updated', {
      assignedCount,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`[controles-updated] broadcast → ${assignedCount} paciente(s) asignado(s)`);
  }
}

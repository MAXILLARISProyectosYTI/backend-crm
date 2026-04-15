import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CrmControlesGuard } from 'src/auth/guards/crm-controles.guard';
import { NotificacionesService } from './notificaciones.service';
import { NotificacionesGateway } from './notificaciones.gateway';

@UseGuards(JwtAuthGuard, CrmControlesGuard)
@Controller('notificaciones')
export class NotificacionesController {
  constructor(
    private readonly service: NotificacionesService,
    private readonly gateway: NotificacionesGateway,
  ) {}

  /** Admin → todas; usuario regular → solo las de sus pacientes asignados */
  @Get()
  findAll(@Request() req: { user?: { userId?: string } }) {
    return this.service.findAllForUser(req.user?.userId ?? null);
  }

  @Patch(':id/leida')
  markAsRead(@Param('id', ParseIntPipe) id: number) {
    return this.service.markAsRead(id);
  }

  /** Marca como leídas las notificaciones visibles para el usuario */
  @Patch('mark-all-read')
  markAllAsRead(@Request() req: { user?: { userId?: string } }) {
    return this.service.markAllAsRead(req.user?.userId ?? null);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post('test-ws')
  testWebSocket() {
    this.gateway.broadcast(1);
    return { ok: true, message: 'Evento notif-update enviado por WebSocket' };
  }
}

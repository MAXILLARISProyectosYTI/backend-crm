import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { AdminUserGuard } from 'src/auth/guards/admin-user.guard';
import { NotificacionesService } from './notificaciones.service';

@UseGuards(JwtAuthGuard, AdminUserGuard)
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly service: NotificacionesService) {}

  /** Todas las notificaciones ordenadas por fecha DESC */
  @Get()
  findAll() {
    return this.service.findAll();
  }

  /** Marca una notificación específica como leída */
  @Patch(':id/leida')
  markAsRead(@Param('id', ParseIntPipe) id: number) {
    return this.service.markAsRead(id);
  }

  /** Marca TODAS las notificaciones como leídas */
  @Patch('mark-all-read')
  markAllAsRead() {
    return this.service.markAllAsRead();
  }

  /** Elimina una notificación */
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}

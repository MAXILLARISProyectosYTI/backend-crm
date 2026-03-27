import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notificacion } from './notificacion.entity';
import { NotificacionesService } from './notificaciones.service';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesGateway } from './notificaciones.gateway';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notificacion]),
    UserModule,
  ],
  providers: [NotificacionesService, NotificacionesGateway],
  controllers: [NotificacionesController],
  exports: [NotificacionesService, NotificacionesGateway],
})
export class NotificacionesModule {}

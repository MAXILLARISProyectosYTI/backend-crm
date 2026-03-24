import { Module, forwardRef } from '@nestjs/common';
import { UserModule } from 'src/user/user.module';
import { SvServices } from 'src/sv-services/sv.services';
import { CrmControlesController } from './crm-controles.controller';
import { CrmControlesService } from './crm-controles.service';
import { CrmControlesCronService } from './crm-controles-cron.service';
import { NotificacionesModule } from 'src/notificaciones/notificaciones.module';

@Module({
  imports: [UserModule, forwardRef(() => NotificacionesModule)],
  controllers: [CrmControlesController],
  providers: [CrmControlesService, CrmControlesCronService, SvServices],
  exports: [CrmControlesService],
})
export class CrmControlesModule {}

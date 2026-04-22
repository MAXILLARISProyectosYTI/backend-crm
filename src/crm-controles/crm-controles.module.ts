import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from 'src/user/user.module';
import { SvServices } from 'src/sv-services/sv.services';
import { CrmControlesController } from './crm-controles.controller';
import { CrmControlesService } from './crm-controles.service';
import { CrmControlesCronService } from './crm-controles-cron.service';
import { CrmControlesSeedService } from './crm-controles-seed.service';
import { CrmControlesAssignmentService } from './crm-controles-assignment.service';
import { NotificacionesModule } from 'src/notificaciones/notificaciones.module';
import { KpiGerencialModule } from 'src/kpi-gerencial/kpi-gerencial.module';
import { AssignmentQueueStateModule } from 'src/assignment-queue-state/assignment-queue-state.module';
import { RoleModule } from 'src/role/role.module';
import { User } from 'src/user/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    UserModule,
    forwardRef(() => NotificacionesModule),
    forwardRef(() => KpiGerencialModule),
    AssignmentQueueStateModule,
    RoleModule,
  ],
  controllers: [CrmControlesController],
  providers: [
    CrmControlesService,
    CrmControlesCronService,
    CrmControlesSeedService,
    CrmControlesAssignmentService,
    SvServices,
  ],
  exports: [CrmControlesService],
})
export class CrmControlesModule {}

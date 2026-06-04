import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CrmCerradoraSolicitud } from './crm-cerradora-solicitud.entity';
import { OpportunitiesClosers } from '../opportunities-closers/opportunities-closers.entity';
import { CrmCerradoresService } from './crm-cerradoras.service';
import { CrmCerradoresController } from './crm-cerradoras.controller';
import { CrmCerradoresContratosController } from './crm-cerradoras-contratos.controller';
import { UserModule } from '../user/user.module';
import { OpportunitiesClosersModule } from '../opportunities-closers/opportunities-closers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CrmCerradoraSolicitud, OpportunitiesClosers]),
    UserModule,
    OpportunitiesClosersModule,
  ],
  providers: [CrmCerradoresService],
  controllers: [CrmCerradoresController, CrmCerradoresContratosController],
  exports: [CrmCerradoresService],
})
export class CrmCerradoresModule {}

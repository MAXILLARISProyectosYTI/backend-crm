import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Incidencia } from './incidencia.entity';
import { User } from 'src/user/user.entity';
import { IncidenciasService } from './incidencias.service';
import { IncidenciasController } from './incidencias.controller';
import { UserModule } from 'src/user/user.module';
import { SvServices } from 'src/sv-services/sv.services';

@Module({
  imports: [TypeOrmModule.forFeature([Incidencia, User]), UserModule],
  providers: [IncidenciasService, SvServices],
  controllers: [IncidenciasController],
  exports: [IncidenciasService],
})
export class IncidenciasModule {}

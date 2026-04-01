import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Incidencia } from './incidencia.entity';
import { IncidenciasService } from './incidencias.service';
import { IncidenciasController } from './incidencias.controller';
import { UserModule } from 'src/user/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([Incidencia]), UserModule],
  providers: [IncidenciasService],
  controllers: [IncidenciasController],
  exports: [IncidenciasService],
})
export class IncidenciasModule {}

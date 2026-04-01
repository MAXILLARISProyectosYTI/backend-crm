import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetaGerencial } from './meta-gerencial.entity';
import { KpiSnapshot } from './kpi-snapshot.entity';
import { KpiGerencialService } from './kpi-gerencial.service';
import { KpiGerencialController } from './kpi-gerencial.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MetaGerencial, KpiSnapshot])],
  controllers: [KpiGerencialController],
  providers: [KpiGerencialService],
  exports: [KpiGerencialService],
})
export class KpiGerencialModule {}

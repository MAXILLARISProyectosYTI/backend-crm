import { Module } from '@nestjs/common';
import { KpiController } from './kpi.controller';
import { KpiService } from './kpi.service';
import { SvServices } from '../sv-services/sv.services';

@Module({
  controllers: [KpiController],
  providers: [KpiService, SvServices],
  exports: [KpiService],
})
export class KpiModule {}




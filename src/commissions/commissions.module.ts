import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommissionType } from './commission-type.entity';
import { CommissionPeriod } from './commission-period.entity';
import { CommissionRecord } from './commission-record.entity';
import { CommissionDetail } from './commission-detail.entity';
import { CommissionClosureTag } from './commission-closure-tag.entity';
import { CommissionPeriodRate } from './commission-period-rate.entity';
import { CommissionCerradoraSedeApoyo } from './commission-cerradora-sede-apoyo.entity';
import { CommissionInvoiceOverride } from './commission-invoice-override.entity';
import { CommissionsService } from './commissions.service';
import { CommissionsDataService } from './commissions-data.service';
import { CommissionsController } from './commissions.controller';
import { OiSvInvoiceService } from './services/oi-sv-invoice.service';
import { CrmControlesModule } from '../crm-controles/crm-controles.module';
import { SvServices } from '../sv-services/sv.services';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CommissionType,
      CommissionPeriod,
      CommissionRecord,
      CommissionDetail,
      CommissionClosureTag,
      CommissionPeriodRate,
      CommissionCerradoraSedeApoyo,
      CommissionInvoiceOverride,
    ]),
    forwardRef(() => CrmControlesModule),
  ],
  controllers: [CommissionsController],
  providers: [CommissionsService, CommissionsDataService, OiSvInvoiceService, SvServices],
  exports: [CommissionsService, CommissionsDataService, OiSvInvoiceService],
})
export class CommissionsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Opportunity } from '../opportunity/opportunity.entity';
import { ReferralCashbackConfig } from './entities/referral-cashback-config.entity';
import { ReferralCashbackBalance } from './entities/referral-cashback-balance.entity';
import { ReferralCashbackLedger } from './entities/referral-cashback-ledger.entity';
import { ReferralCashbackService } from './referral-cashback.service';
import { ReferralCashbackController } from './referral-cashback.controller';
import { ReferralCashbackFromSvController } from './referral-cashback-from-sv.controller';
import { ReferralCashbackSvService } from './services/referral-cashback-sv.service';
import { ReferralCashbackExpirationCronService } from './referral-cashback-expiration-cron.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReferralCashbackConfig,
      ReferralCashbackBalance,
      ReferralCashbackLedger,
      Opportunity,
    ]),
  ],
  controllers: [ReferralCashbackController, ReferralCashbackFromSvController],
  providers: [
    ReferralCashbackService,
    ReferralCashbackSvService,
    ReferralCashbackExpirationCronService,
  ],
  exports: [ReferralCashbackService, ReferralCashbackSvService],
})
export class ReferralCashbackModule {}

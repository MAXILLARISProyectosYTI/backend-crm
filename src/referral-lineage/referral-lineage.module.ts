import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Opportunity } from '../opportunity/opportunity.entity';
import { ReferralCashbackModule } from '../referral-cashback/referral-cashback.module';
import { ReferralLineageService } from './referral-lineage.service';

@Module({
  imports: [TypeOrmModule.forFeature([Opportunity]), ReferralCashbackModule],
  providers: [ReferralLineageService],
  exports: [ReferralLineageService],
})
export class ReferralLineageModule {}

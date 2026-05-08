import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpportunityDerivation } from './opportunity-derivation.entity';
import { OpportunityDerivationService } from './opportunity-derivation.service';
import { OpportunityDerivationController } from './opportunity-derivation.controller';
import { Opportunity } from 'src/opportunity/opportunity.entity';
import { UserModule } from 'src/user/user.module';
import { AssignmentQueueStateModule } from 'src/assignment-queue-state/assignment-queue-state.module';
import { ActionHistoryModule } from 'src/action-history/action-history.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OpportunityDerivation, Opportunity]),
    UserModule,
    AssignmentQueueStateModule,
    ActionHistoryModule,
  ],
  controllers: [OpportunityDerivationController],
  providers: [OpportunityDerivationService],
  exports: [OpportunityDerivationService],
})
export class OpportunityDerivationModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpportunitiesClosersService } from './opportunities-closers.service';
import { OpportunitiesClosersController } from './opportunities-closers.controller';
import { OpportunitiesClosers } from './opportunities-closers.entity';
import { UserModule } from 'src/user/user.module';
import { SvServices } from 'src/sv-services/sv.services';
import { FilesModule } from 'src/files/files.module';
import { ActionHistoryModule } from 'src/action-history/action-history.module';
import { OpportunitiesClosersCronsService } from './opportunity-closers-crons.service';
import { OpportunityModule } from 'src/opportunity/opportunity.module';
import { CampusTeamModule } from 'src/campus-team/campus-team.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OpportunitiesClosers]),
    UserModule,
    FilesModule,
    ActionHistoryModule,
    OpportunityModule,
    CampusTeamModule,
  ],
  controllers: [OpportunitiesClosersController],
  providers: [OpportunitiesClosersService, SvServices, OpportunitiesClosersCronsService],
  exports: [OpportunitiesClosersService],
})
export class OpportunitiesClosersModule {}

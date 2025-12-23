import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Opportunity } from './opportunity.entity';
import { OpportunityService } from './opportunity.service';
import { OpportunityController } from './opportunity.controller';
import { OpportunityGateway } from './opportunity.gateway';
import { OpportunityWebSocketService } from './opportunity-websocket.service';
import { ContactModule } from 'src/contact/contact.module';
import { UserModule } from 'src/user/user.module';
import { ScheduleModule } from '@nestjs/schedule';
import { OpportunityCronsService } from './opportunity-crons.service';
import { MeetingModule } from 'src/meeting/meeting.module';
import { SvServices } from 'src/sv-services/sv.services';
import { ActionHistoryModule } from 'src/action-history/action-history.module';
import { FilesModule } from 'src/files/files.module';
import { CampaignModule } from 'src/campaign/campaign.module';
import { OpportunityPresave } from './opportunity-presave.entity';
import { OpportunityPresaveService } from './opportunity-presave.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Opportunity, OpportunityPresave]),
    ContactModule,
    MeetingModule,
    forwardRef(() => UserModule),
    ScheduleModule.forRoot(),
    ActionHistoryModule,
    FilesModule,
    CampaignModule,
  ],
  controllers: [OpportunityController],  
  providers: [
    OpportunityService,
    OpportunityGateway,
    OpportunityWebSocketService,
    OpportunityCronsService,
    SvServices,
    OpportunityPresaveService,
  ],
  exports: [
    OpportunityService, 
    OpportunityWebSocketService, // Exportar para uso en otros módulos
    OpportunityPresaveService,
  ],
})
export class OpportunityModule {}

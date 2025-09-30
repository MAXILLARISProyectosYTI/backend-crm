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

@Module({
  imports: [
    TypeOrmModule.forFeature([Opportunity]),
    ContactModule,
    MeetingModule,
    forwardRef(() => UserModule),
    ScheduleModule.forRoot(),
    ActionHistoryModule,
    FilesModule,
  ],
  controllers: [OpportunityController],  
  providers: [
    OpportunityService,
    OpportunityGateway,
    OpportunityWebSocketService,
    OpportunityCronsService,
    SvServices
  ],
  exports: [
    OpportunityService, 
    OpportunityWebSocketService, // Exportar para uso en otros módulos
  ],
})
export class OpportunityModule {}

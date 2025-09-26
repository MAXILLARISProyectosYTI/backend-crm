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

@Module({
  imports: [
    TypeOrmModule.forFeature([Opportunity]),
    ContactModule,
    forwardRef(() => UserModule),
    ScheduleModule.forRoot(),
  ],
  controllers: [OpportunityController],
  providers: [
    OpportunityService,
    OpportunityGateway,
    OpportunityWebSocketService,
    OpportunityCronsService,
  ],
  exports: [
    OpportunityService, 
    OpportunityWebSocketService, // Exportar para uso en otros módulos
  ],
})
export class OpportunityModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Opportunity } from './opportunity.entity';
import { OpportunityService } from './opportunity.service';
import { OpportunityController } from './opportunity.controller';
import { OpportunityGateway } from './opportunity.gateway';
import { OpportunityWebSocketService } from './opportunity-websocket.service';

@Module({
  imports: [TypeOrmModule.forFeature([Opportunity])],
  controllers: [OpportunityController],
  providers: [
    OpportunityService,
    OpportunityGateway,
    OpportunityWebSocketService,
  ],
  exports: [
    OpportunityService, 
    OpportunityWebSocketService, // Exportar para uso en otros módulos
  ],
})
export class OpportunityModule {}

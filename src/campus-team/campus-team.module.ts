import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CampusTeam } from './campus-team.entity';
import { CampusTeamService } from './campus-team.service';
import { CampusTeamController } from './campus-team.controller';
import { Team } from '../team/team.entity';
import { SvServices } from '../sv-services/sv.services';

@Module({
  imports: [TypeOrmModule.forFeature([CampusTeam, Team])],
  controllers: [CampusTeamController],
  providers: [CampusTeamService, SvServices],
  exports: [CampusTeamService],
})
export class CampusTeamModule {}

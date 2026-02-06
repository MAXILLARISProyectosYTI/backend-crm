import { Module } from '@nestjs/common';
import { TeamService } from './team.service';
import { TeamController } from './team.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Team } from './team.entity';
import { CommonModule } from '../common/common.module';
import { TeamUserModule } from '../team-user/team-user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Team]),
    CommonModule,
    TeamUserModule,
  ],
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}

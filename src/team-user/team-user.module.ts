import { Module } from '@nestjs/common';
import { TeamUserService } from './team-user.service';
import { TeamUserController } from './team-user.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamUser } from './team-user.entity';
  
@Module({
  imports: [TypeOrmModule.forFeature([TeamUser])],
  controllers: [TeamUserController],
  providers: [TeamUserService],
  exports: [TeamUserService],
})
export class TeamUserModule {}

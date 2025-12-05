import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { Opportunity } from '../opportunity/opportunity.entity';
import { OpportunityModule } from 'src/opportunity/opportunity.module';
import { TeamUserModule } from 'src/team-user/team-user.module';
import { RoleModule } from 'src/role/role.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Opportunity]), forwardRef(() => OpportunityModule), forwardRef(() => TeamUserModule), forwardRef(() => RoleModule)],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService], // Exportar el servicio para uso en otros módulos
})
export class UserModule {}

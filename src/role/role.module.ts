import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './role.entity';
import { RoleUser } from './role-user.entity';
import { RoleTeam } from './role-team.entity';
import { RoleService } from './role.service';
import { RoleController, UserRoleController } from './role.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Role, RoleUser, RoleTeam])],
  controllers: [RoleController, UserRoleController],
  providers: [RoleService],
  exports: [RoleService], // Exportar el servicio para uso en otros módulos
})
export class RoleModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { Opportunity } from '../opportunity/opportunity.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Opportunity])],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService], // Exportar el servicio para uso en otros módulos
})
export class UserModule {}

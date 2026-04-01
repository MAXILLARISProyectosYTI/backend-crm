import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/user/user.entity';
import { FilteredUsersService } from './filtered-users.service';
import { FilteredUsersController } from './filtered-users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [FilteredUsersController],
  providers: [FilteredUsersService],
})
export class FilteredUsersModule {}

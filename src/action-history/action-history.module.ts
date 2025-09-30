import { Module } from '@nestjs/common';
import { ActionHistoryService } from './action-history.service';
import { ActionHistoryController } from './action-history.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActionHistory } from './action-history.entity';
import { FilesModule } from 'src/files/files.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActionHistory]),
    FilesModule,
  ],
  controllers: [ActionHistoryController],
  providers: [ActionHistoryService],
  exports: [ActionHistoryService],
})
export class ActionHistoryModule {}

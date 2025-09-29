import { Module } from '@nestjs/common';
import { MeetingService } from './meeting.service';
import { MeetingController } from './meeting.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Meeting } from './meeting.entity';
import { UserModule } from 'src/user/user.module';
import { ActionHistoryModule } from 'src/action-history/action-history.module';

@Module({
  imports: [TypeOrmModule.forFeature([Meeting]), UserModule, ActionHistoryModule],
  controllers: [MeetingController],
  providers: [MeetingService],
  exports: [MeetingService],
})
export class MeetingModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentQueueState } from './assignment-queue-state.entity';
import { AssignmentQueueStateService } from './assignment-queue-state.service';

@Module({
  imports: [TypeOrmModule.forFeature([AssignmentQueueState])],
  providers: [AssignmentQueueStateService],
  exports: [AssignmentQueueStateService],
})
export class AssignmentQueueStateModule {}

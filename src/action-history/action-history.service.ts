import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Not, Repository } from 'typeorm';
import { ActionHistory } from './action-history.entity';
import { IdGeneratorService } from 'src/common/services/id-generator.service';
import { CreateActionDto } from './dto/create-action.dto';

@Injectable()
export class ActionHistoryService {

  constructor(
    @InjectRepository(ActionHistory)
    private readonly actionHistoryRepository: Repository<ActionHistory>,
    private readonly idGeneratorService: IdGeneratorService,
  ) {}

  async getRecordByTargetId(targetId: string): Promise<ActionHistory[]> {
    return await this.actionHistoryRepository
      .createQueryBuilder('actionHistory')
      .select([
        'actionHistory.id',
        'actionHistory.action',
        'actionHistory.createdAt',
        'user.id',
        'user.userName',
      ])
      .leftJoin('actionHistory.user', 'user')
      .where('actionHistory.targetId = :targetId', { targetId })
      .andWhere('actionHistory.deleted = :deleted', { deleted: false })
      .andWhere('actionHistory.action NOT ILIKE :action', { action: '%read%' })
      .getMany();
  }

  async addRecord(actionHistory: CreateActionDto): Promise<ActionHistory> {

    const payload: Partial<ActionHistory> = {
      id: this.idGeneratorService.generateId(),
      createdAt: new Date(),
      targetId: actionHistory.targetId,
      userId: actionHistory.userId,   
      action: 'update',
      targetType: actionHistory.target_type,
      message: actionHistory.message,
    }

    return await this.actionHistoryRepository.save(payload);
  }
  
}

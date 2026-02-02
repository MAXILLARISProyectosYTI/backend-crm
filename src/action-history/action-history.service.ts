import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Not, Repository } from 'typeorm';
import { ActionHistory } from './action-history.entity';
import { IdGeneratorService } from 'src/common/services/id-generator.service';
import { CreateActionDto } from './dto/create-action.dto';
import { DateTime } from 'luxon';

@Injectable()
export class ActionHistoryService {

  constructor(
    @InjectRepository(ActionHistory)
    private readonly actionHistoryRepository: Repository<ActionHistory>,
    private readonly idGeneratorService: IdGeneratorService,
  ) {}

  async getRecordByTargetId(targetId: string): Promise<ActionHistory[]> {
    const startTime = Date.now();
    
    // Evitar `NOT ILIKE '%read%'` en SQL: obliga a full scan y es carísimo.
    // Traemos un lote acotado usando filtros indexables y filtramos `read` en memoria.
    const rows = await this.actionHistoryRepository.find({
      where: {
        targetId,
        deleted: false,
      },
      relations: ['user'],
      select: {
        id: true,
        action: true,
        createdAt: true,
        data: true,
        user: {
          id: true,
          userName: true,
        },
      },
      order: {
        createdAt: 'DESC',
      },
      take: 500,
    });

    const queryTime = Date.now() - startTime;
    const filtered = rows.filter((r) => !(r.action ?? '').toLowerCase().includes('read'));
    const totalTime = Date.now() - startTime;
    
    if (queryTime > 500) {
      console.warn(`[PERFORMANCE] ⚠️ getRecordByTargetId tardó ${queryTime}ms (total: ${totalTime}ms) para targetId: ${targetId}`);
      console.warn(`[PERFORMANCE] Registros encontrados: ${rows.length}, después de filtrar 'read': ${filtered.length}`);
    } else {
      console.log(`[PERFORMANCE] ✓ getRecordByTargetId completado en ${totalTime}ms, registros: ${filtered.length}`);
    }

    return filtered;
  }

  async addRecord(actionHistory: CreateActionDto): Promise<ActionHistory> {

    const payload: Partial<ActionHistory> = {
      id: this.idGeneratorService.generateId(),
      createdAt: DateTime.now().setZone("America/Lima").plus({hours: 5}).toJSDate(),
      targetId: actionHistory.targetId,
      userId: actionHistory.userId,   
      action: 'update',
      targetType: actionHistory.target_type,
      data: actionHistory.message || undefined,
    }

    return await this.actionHistoryRepository.save(payload);
  }
  
}

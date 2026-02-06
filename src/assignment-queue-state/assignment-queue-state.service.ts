import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignmentQueueState } from './assignment-queue-state.entity';

export interface QueueStateRow {
  lastAssignedUserId: string;
  lastAssignedAt: Date;
  lastOpportunityId: string | null;
}

/**
 * Estado estable de la cola por (sede, subcampaña).
 * Se actualiza en cada asignación (crear oportunidad o reasignar); la lectura de "último/siguiente" usa esto.
 */
@Injectable()
export class AssignmentQueueStateService {
  constructor(
    @InjectRepository(AssignmentQueueState)
    private readonly repo: Repository<AssignmentQueueState>,
  ) {}

  /**
   * Registra una asignación: actualiza el estado para esa sede + subcampaña.
   * Llamar después de crear una oportunidad o de reasignar (update assignedUserId).
   */
  async recordAssignment(
    campusId: number,
    subCampaignId: string,
    assignedUserId: string,
    opportunityId: string | null,
  ): Promise<void> {
    const now = new Date();
    await this.repo.upsert(
      {
        campusId,
        subCampaignId,
        lastAssignedUserId: assignedUserId,
        lastAssignedAt: now,
        lastOpportunityId: opportunityId ?? null,
        updatedAt: now,
      },
      { conflictPaths: ['campusId', 'subCampaignId'] },
    );
  }

  /**
   * Devuelve el estado de la cola para esa sede + subcampaña, o null si no hay ningún registro.
   */
  async getState(campusId: number, subCampaignId: string): Promise<QueueStateRow | null> {
    const row = await this.repo.findOne({
      where: { campusId, subCampaignId },
    });
    if (!row) return null;
    return {
      lastAssignedUserId: row.lastAssignedUserId,
      lastAssignedAt: row.lastAssignedAt,
      lastOpportunityId: row.lastOpportunityId,
    };
  }
}

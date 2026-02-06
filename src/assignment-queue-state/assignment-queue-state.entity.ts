import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * Estado estable de la cola de asignación por (sede, subcampaña).
 * Única fuente de verdad para "último asignado" y "siguiente"; se actualiza en cada asignación.
 */
@Entity('assignment_queue_state')
export class AssignmentQueueState {
  @PrimaryColumn({ type: 'integer', name: 'campus_id' })
  campusId: number;

  @PrimaryColumn({ type: 'varchar', length: 17, name: 'sub_campaign_id' })
  subCampaignId: string;

  @Column({ type: 'varchar', length: 17, name: 'last_assigned_user_id' })
  lastAssignedUserId: string;

  @Column({ type: 'timestamptz', name: 'last_assigned_at' })
  lastAssignedAt: Date;

  @Column({ type: 'varchar', length: 17, name: 'last_opportunity_id', nullable: true })
  lastOpportunityId: string | null;

  @Column({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

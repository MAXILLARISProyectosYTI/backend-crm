import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum DerivationStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
}

@Entity('opportunity_derivation')
@Index('idx_opportunity_derivation_opportunity_id', ['opportunityId'], { unique: true })
@Index('idx_opportunity_derivation_assigned_user', ['assignedUserId'])
export class OpportunityDerivation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 17, name: 'opportunity_id', unique: true })
  opportunityId: string;

  @Column({ type: 'varchar', length: 10, name: 'derived_to', default: 'OI' })
  derivedTo: string;

  @Column({ type: 'varchar', length: 17, name: 'assigned_user_id' })
  assignedUserId: string;

  @Column({ type: 'integer', nullable: true, name: 'campus_id' })
  campusId: number | null;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'created_by_id' })
  createdById: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'status',
    default: DerivationStatus.ACTIVE,
  })
  status: DerivationStatus;

  /** Origen de la derivación: 'controles' si vino del CRM Controles, null si es OFM directo */
  @Column({ type: 'varchar', length: 20, nullable: true, name: 'source' })
  source: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

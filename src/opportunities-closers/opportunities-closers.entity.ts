import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('c_oportunidad_cerradora')
@Index('idx_c_oportunidad_cerradora_assigned_user', ['assignedUserId', 'deleted'])
@Index('idx_c_oportunidad_cerradora_assigned_user_id', ['assignedUserId'])
@Index('idx_c_oportunidad_cerradora_created_at', ['createdAt'])
@Index('idx_c_oportunidad_cerradora_created_by_id', ['createdById'])
@Index('idx_c_oportunidad_cerradora_modified_by_id', ['modifiedById'])
@Index('idx_c_oportunidad_cerradora_name', ['name', 'deleted'])
@Index('idx_c_oportunidad_cerradora_opportunity_id', ['opportunityId'])
@Index('uniq_c_oportunidad_cerradora_created_at_id', ['createdAt', 'id'], { unique: true })
export class OpportunitiesClosers {
  @PrimaryColumn({ type: 'varchar', length: 17 })
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name?: string;

  @Column({ type: 'boolean', nullable: true, default: false })
  deleted?: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true, default: 'pending' })
  status?: string;

  @Column({ 
    type: 'timestamp', 
    precision: 0, 
    nullable: true,
    name: 'date_start'
  })
  dateStart?: Date;

  @Column({ 
    type: 'timestamp', 
    precision: 0, 
    nullable: true,
    name: 'date_end'
  })
  dateEnd?: Date;

  @Column({ 
    type: 'boolean', 
    default: false,
    name: 'is_all_day'
  })
  isAllDay: boolean;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ 
    type: 'timestamp', 
    precision: 0, 
    nullable: true,
    name: 'created_at'
  })
  createdAt?: Date;

  @Column({ 
    type: 'timestamp', 
    precision: 0, 
    nullable: true,
    name: 'modified_at'
  })
  modifiedAt?: Date;

  @Column({ 
    type: 'date', 
    nullable: true,
    name: 'date_start_date'
  })
  dateStartDate?: Date;

  @Column({ 
    type: 'date', 
    nullable: true,
    name: 'date_end_date'
  })
  dateEndDate?: Date;

  @Column({ 
    type: 'timestamp', 
    precision: 0, 
    nullable: true,
    name: 'stream_updated_at'
  })
  streamUpdatedAt?: Date;

  @Column({ 
    type: 'varchar', 
    length: 17, 
    nullable: true,
    name: 'parent_id'
  })
  parentId?: string;

  @Column({ 
    type: 'varchar', 
    length: 100, 
    nullable: true,
    name: 'parent_type'
  })
  parentType?: string;

  @Column({ 
    type: 'varchar', 
    length: 17, 
    nullable: true,
    name: 'created_by_id'
  })
  createdById?: string;

  @Column({ 
    type: 'varchar', 
    length: 17, 
    nullable: true,
    name: 'modified_by_id'
  })
  modifiedById?: string;

  @Column({ 
    type: 'varchar', 
    length: 17, 
    nullable: true,
    name: 'assigned_user_id'
  })
  assignedUserId?: string;

  @Column({ 
    type: 'varchar', 
    length: 100, 
    nullable: true,
    default: 'Pendiente'
  })
  estado?: string;

  @Column({ 
    type: 'varchar', 
    length: 100, 
    nullable: true,
    name: 'h_c_patient'
  })
  hCPatient?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  url?: string;

  @Column({ 
    type: 'varchar', 
    length: 17, 
    nullable: true,
    name: 'cotizacion_id'
  })
  cotizacionId?: string;

  @Column({ 
    type: 'varchar', 
    length: 17, 
    nullable: true,
    name: 'factura_id'
  })
  facturaId?: string;

  @Column({ 
    type: 'text', 
    nullable: true,
    name: 'reason_lost'
  })
  reasonLost?: string;

  @Column({ 
    type: 'text', 
    nullable: true,
    name: 'sub_reason_lost'
  })
  subReasonLost?: string;

  @Column({ 
    type: 'text', 
    nullable: true,
    name: 'quotations_details'
  })
  quotationsDetails?: string;

  @Column({ 
    type: 'varchar', 
    length: 17, 
    nullable: true,
    name: 'contract_id'
  })
  contractId?: string;

  @Column({ 
    type: 'varchar', 
    length: 17, 
    nullable: true,
    name: 'opportunity_id'
  })
  opportunityId?: string;
}


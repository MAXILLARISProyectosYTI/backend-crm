import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('meeting')
@Index('idx_meeting_account_id', ['accountId'])
@Index('idx_meeting_assigned_user', ['assignedUserId', 'deleted'])
@Index('idx_meeting_assigned_user_id', ['assignedUserId'])
@Index('idx_meeting_assigned_user_status', ['assignedUserId', 'status'])
@Index('idx_meeting_created_by_id', ['createdById'])
@Index('idx_meeting_date_start', ['dateStart', 'deleted'])
@Index('idx_meeting_date_start_status', ['dateStart', 'status'])
@Index('idx_meeting_modified_by_id', ['modifiedById'])
@Index('idx_meeting_parent', ['parentId', 'parentType'])
@Index('idx_meeting_status', ['status', 'deleted'])
@Index('idx_meeting_uid', ['uid'])
export class Meeting {
  @PrimaryColumn({ type: 'varchar', length: 17 })
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name?: string;

  @Column({ type: 'boolean', nullable: true, default: false })
  deleted?: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true, default: 'Planned' })
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

  @Column({ type: 'varchar', length: 255, nullable: true })
  uid?: string;

  @Column({ 
    type: 'text', 
    nullable: true,
    name: 'join_url'
  })
  joinUrl?: string;

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
    name: 'account_id'
  })
  accountId?: string;

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
}

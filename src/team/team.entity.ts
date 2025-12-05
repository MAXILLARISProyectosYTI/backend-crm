import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('team')
@Index('idx_team_layout_set_id', ['layoutSetId'])
@Index('idx_team_working_time_calendar_id', ['workingTimeCalendarId'])
export class Team {
  @PrimaryColumn({ type: 'varchar', length: 17 })
  id: string;

  @Column({ 
    type: 'varchar', 
    length: 100, 
    nullable: true 
  })
  name?: string;

  @Column({ 
    type: 'boolean', 
    nullable: true, 
    default: false 
  })
  deleted?: boolean;

  @Column({ 
    type: 'text', 
    nullable: true,
    name: 'position_list'
  })
  positionList?: string;

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
    type: 'varchar', 
    length: 17, 
    nullable: true,
    name: 'layout_set_id'
  })
  layoutSetId?: string;

  @Column({ 
    type: 'varchar', 
    length: 17, 
    nullable: true,
    name: 'working_time_calendar_id'
  })
  workingTimeCalendarId?: string;
}
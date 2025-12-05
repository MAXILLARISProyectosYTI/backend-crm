import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('team_user')
@Index('idx_team_user_team_id', ['teamId'])
@Index('idx_team_user_user_id', ['userId'])
@Index('uniq_team_user_team_id_user_id', ['teamId', 'userId'], { unique: true })
export class TeamUser {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ 
    type: 'varchar', 
    length: 17, 
    nullable: true,
    name: 'team_id'
  })
  teamId?: string;

  @Column({ 
    type: 'varchar', 
    length: 17, 
    nullable: true,
    name: 'user_id'
  })
  userId?: string;

  @Column({ 
    type: 'varchar', 
    length: 100, 
    nullable: true 
  })
  role?: string;

  @Column({ 
    type: 'boolean', 
    nullable: true, 
    default: false 
  })
  deleted?: boolean;
}
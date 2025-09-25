import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('role_team')
@Index('idx_role_team_role_id', ['roleId'])
@Index('idx_role_team_team_id', ['teamId'])
@Index('uniq_role_team_role_id_team_id', ['roleId', 'teamId'])
export class RoleTeam {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'role_id' })
  roleId?: string;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'team_id' })
  teamId?: string;

  @Column({ type: 'boolean', nullable: true, default: false })
  deleted?: boolean;
}

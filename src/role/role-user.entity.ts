import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('role_user')
@Index('idx_role_user_role_id', ['roleId'])
@Index('idx_role_user_user_id', ['userId'])
@Index('uniq_role_user_role_id_user_id', ['roleId', 'userId'])
export class RoleUser {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'role_id' })
  roleId?: string;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'user_id' })
  userId?: string;

  @Column({ type: 'boolean', nullable: true, default: false })
  deleted?: boolean;
}

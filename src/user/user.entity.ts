import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('user')
@Index('idx_user_contact_id', ['contactId'])
@Index('idx_user_created_by_id', ['createdById'])
@Index('idx_user_dashboard_template_id', ['dashboardTemplateId'])
@Index('idx_user_default_team_id', ['defaultTeamId'])
@Index('idx_user_layout_set_id', ['layoutSetId'])
@Index('idx_user_type', ['type'])
@Index('idx_user_user_name', ['userName'])
@Index('idx_user_working_time_calendar_id', ['workingTimeCalendarId'])
@Index('uniq_user_user_name_delete_id', ['userName', 'deleteId'])
export class User {
  @PrimaryColumn({ type: 'varchar', length: 17 })
  id: string;

  @Column({ type: 'boolean', nullable: true, default: false })
  deleted?: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'user_name' })
  userName?: string;

  @Column({ type: 'varchar', length: 24, nullable: true, default: 'regular' })
  type?: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  password?: string;

  @Column({ type: 'varchar', length: 24, nullable: true, name: 'auth_method' })
  authMethod?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'api_key' })
  apiKey?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'salutation_name' })
  salutationName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'first_name' })
  firstName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'last_name' })
  lastName?: string;

  @Column({ type: 'boolean', nullable: true, default: true, name: 'is_active' })
  isActive?: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  title?: string;

  @Column({ type: 'varchar', length: 7, nullable: true, name: 'avatar_color' })
  avatarColor?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  gender?: string;

  @Column({ type: 'timestamp', nullable: true, name: 'created_at' })
  createdAt?: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'modified_at' })
  modifiedAt?: Date;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'middle_name' })
  middleName?: string;

  @Column({ type: 'varchar', length: 17, nullable: true, default: '0', name: 'delete_id' })
  deleteId?: string;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'default_team_id' })
  defaultTeamId?: string;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'contact_id' })
  contactId?: string;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'avatar_id' })
  avatarId?: string;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'created_by_id' })
  createdById?: string;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'dashboard_template_id' })
  dashboardTemplateId?: string;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'working_time_calendar_id' })
  workingTimeCalendarId?: string;

  @Column({ type: 'varchar', length: 17, nullable: true, name: 'layout_set_id' })
  layoutSetId?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_usersv' })
  cUsersv?: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'c_contrasea_sv' })
  cContraseaSv?: string;

  @Column({ type: 'boolean', nullable: true, default: false, name: 'c_ocupado' })
  cOcupado?: boolean;

  @Column({ type: 'boolean', nullable: true, default: false, name: 'c_c_busy' })
  cCBusy?: boolean;

  @Column({ type: 'boolean', nullable: true, default: false, name: 'c_busy' })
  cBusy?: boolean;
}

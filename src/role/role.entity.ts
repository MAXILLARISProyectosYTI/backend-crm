import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('role')
export class Role {
  @PrimaryColumn({ type: 'varchar', length: 17 })
  id: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  name?: string;

  @Column({ type: 'boolean', nullable: true, default: false })
  deleted?: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true, default: 'not-set', name: 'assignment_permission' })
  assignmentPermission?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: 'not-set', name: 'user_permission' })
  userPermission?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: 'not-set', name: 'message_permission' })
  messagePermission?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: 'not-set', name: 'portal_permission' })
  portalPermission?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: 'not-set', name: 'group_email_account_permission' })
  groupEmailAccountPermission?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: 'not-set', name: 'export_permission' })
  exportPermission?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: 'not-set', name: 'mass_update_permission' })
  massUpdatePermission?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: 'not-set', name: 'data_privacy_permission' })
  dataPrivacyPermission?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: 'not-set', name: 'follower_management_permission' })
  followerManagementPermission?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: 'not-set', name: 'audit_permission' })
  auditPermission?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: 'not-set', name: 'mention_permission' })
  mentionPermission?: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: 'not-set', name: 'user_calendar_permission' })
  userCalendarPermission?: string;

  @Column({ type: 'text', nullable: true })
  data?: string;

  @Column({ type: 'text', nullable: true, name: 'field_data' })
  fieldData?: string;

  @Column({ type: 'timestamp', nullable: true, name: 'created_at' })
  createdAt?: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'modified_at' })
  modifiedAt?: Date;
}

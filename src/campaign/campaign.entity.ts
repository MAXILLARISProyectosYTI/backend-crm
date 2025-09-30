import { Entity, PrimaryColumn, Column, Index } from 'typeorm';

@Entity('campaign')
@Index('idx_campaign_accounts_template_id', ['accountsTemplateId'])
@Index('idx_campaign_assigned_user_id', ['assignedUserId'])
@Index('idx_campaign_contacts_template_id', ['contactsTemplateId'])
@Index('idx_campaign_created_at', ['createdAt', 'deleted'])
@Index('idx_campaign_created_by_id', ['createdById'])
@Index('idx_campaign_leads_template_id', ['leadsTemplateId'])
@Index('idx_campaign_modified_by_id', ['modifiedById'])
@Index('idx_campaign_users_template_id', ['usersTemplateId'])
export class Campaign {
  @PrimaryColumn({ type: 'varchar', length: 17 })
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name?: string;

  @Column({ type: 'boolean', nullable: true, default: false })
  deleted?: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true, default: 'Planning' })
  status?: string;

  @Column({ type: 'varchar', length: 64, nullable: true, default: 'Email' })
  type?: string;

  @Column({ 
    type: 'date', 
    nullable: true,
    name: 'start_date'
  })
  startDate?: Date;

  @Column({ 
    type: 'date', 
    nullable: true,
    name: 'end_date'
  })
  endDate?: Date;

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

  @Column({ type: 'double precision', nullable: true })
  budget?: number;

  @Column({ 
    type: 'boolean', 
    default: true,
    name: 'mail_merge_only_with_address'
  })
  mailMergeOnlyWithAddress: boolean;

  @Column({ 
    type: 'varchar', 
    length: 3, 
    nullable: true,
    name: 'budget_currency'
  })
  budgetCurrency?: string;

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
    length: 17, 
    nullable: true,
    name: 'contacts_template_id'
  })
  contactsTemplateId?: string;

  @Column({ 
    type: 'varchar', 
    length: 17, 
    nullable: true,
    name: 'leads_template_id'
  })
  leadsTemplateId?: string;

  @Column({ 
    type: 'varchar', 
    length: 17, 
    nullable: true,
    name: 'accounts_template_id'
  })
  accountsTemplateId?: string;

  @Column({ 
    type: 'varchar', 
    length: 17, 
    nullable: true,
    name: 'users_template_id'
  })
  usersTemplateId?: string;

  // Campos personalizados (prefijo c_)
  @Column({ 
    type: 'varchar', 
    length: 100, 
    nullable: true,
    default: 'FACEBOOK',
    name: 'c_campaign_channel'
  })
  cCampaignChannel?: string;

  @Column({ 
    type: 'text', 
    nullable: true,
    default: '["FACEBOOK"]',
    name: 'c_canales'
  })
  cCanales?: string;

  @Column({ 
    type: 'text', 
    nullable: true,
    name: 'c_test'
  })
  cTest?: string;

  @Column({ 
    type: 'varchar', 
    length: 17, 
    nullable: true,
    name: 'c_opportunity_id'
  })
  cOpportunityId?: string;
}

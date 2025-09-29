import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, PrimaryColumn } from 'typeorm';

@Entity('contact')
@Index('idx_contact_account_id', ['accountId'])
@Index('idx_contact_assigned_user', ['assignedUserId', 'deleted'])
@Index('idx_contact_assigned_user_id', ['assignedUserId'])
@Index('idx_contact_campaign_id', ['campaignId'])
@Index('idx_contact_created_at', ['createdAt', 'deleted'])
@Index('idx_contact_created_by_id', ['createdById'])
@Index('idx_contact_first_name', ['firstName', 'deleted'])
@Index('idx_contact_modified_by_id', ['modifiedById'])
@Index('idx_contact_name', ['firstName', 'lastName'])
@Index('uniq_contact_created_at_id', ['createdAt', 'id'], { unique: true })
export class Contact {
  @PrimaryColumn({ type: 'varchar', length: 17 })
  id: string;

  @Column({ type: 'boolean', default: false })
  deleted: boolean;

  @Column({ 
    name: 'salutation_name',
    type: 'varchar', 
    length: 255, 
    nullable: true 
  })
  salutationName: string;

  @Column({ 
    name: 'first_name',
    type: 'varchar', 
    length: 100, 
    nullable: true 
  })
  firstName: string;

  @Column({ 
    name: 'last_name',
    type: 'varchar', 
    length: 100, 
    nullable: true 
  })
  lastName: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ 
    name: 'do_not_call',
    type: 'boolean', 
    default: false 
  })
  doNotCall: boolean;

  @Column({ 
    name: 'address_street',
    type: 'varchar', 
    length: 255, 
    nullable: true 
  })
  addressStreet: string;

  @Column({ 
    name: 'address_city',
    type: 'varchar', 
    length: 100, 
    nullable: true 
  })
  addressCity: string;

  @Column({ 
    name: 'address_state',
    type: 'varchar', 
    length: 100, 
    nullable: true 
  })
  addressState: string;

  @Column({ 
    name: 'address_country',
    type: 'varchar', 
    length: 100, 
    nullable: true 
  })
  addressCountry: string;

  @Column({ 
    name: 'address_postal_code',
    type: 'varchar', 
    length: 40, 
    nullable: true 
  })
  addressPostalCode: string;

  @Column({ 
    name: 'middle_name',
    type: 'varchar', 
    length: 100, 
    nullable: true 
  })
  middleName: string;

  @Column({ 
    name: 'stream_updated_at',
    type: 'timestamp', 
    precision: 0, 
    nullable: true 
  })
  streamUpdatedAt: Date;

  @Column({ 
    name: 'account_id',
    type: 'varchar', 
    length: 17, 
    nullable: true 
  })
  accountId: string;

  @Column({ 
    name: 'campaign_id',
    type: 'varchar', 
    length: 17, 
    nullable: true 
  })
  campaignId: string;

  @Column({ 
    name: 'created_by_id',
    type: 'varchar', 
    length: 17, 
    nullable: true 
  })
  createdById: string;

  @Column({ 
    name: 'modified_by_id',
    type: 'varchar', 
    length: 17, 
    nullable: true 
  })
  modifiedById: string;

  @Column({ 
    name: 'assigned_user_id',
    type: 'varchar', 
    length: 17, 
    nullable: true 
  })
  assignedUserId: string;

  @CreateDateColumn({ 
    name: 'created_at',
    type: 'timestamp', 
    precision: 0 
  })
  createdAt: Date;

  @UpdateDateColumn({ 
    name: 'modified_at',
    type: 'timestamp', 
    precision: 0 
  })
  modifiedAt: Date;
}

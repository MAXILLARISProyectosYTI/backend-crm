import {
  Entity,
  PrimaryColumn,
  Column,
  Index,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../user/user.entity';
import { ENUM_TARGET_TYPE } from './dto/enum-target-type';

@Entity('action_history_record')
@Index('idx_action_history_record_target', ['targetType', 'targetId'])
@Index('idx_action_history_record_user_id', ['userId'])
@Index('idx_action_history_record_auth_token_id', ['authTokenId'])
@Index('idx_action_history_record_auth_log_record_id', ['authLogRecordId'])
@Index('uniq_action_history_record_number', ['number'], { unique: true })
export class ActionHistory {
  @PrimaryColumn('varchar', { length: 17 })
  id: string;

  @Column('boolean', { default: false })
  deleted: boolean;

  @Column('bigint', { generated: 'increment' })
  number: number;

  @Column('varchar', { length: 100, nullable: true, name: 'target_type' })
  targetType: ENUM_TARGET_TYPE;

  @Column('text', { nullable: true })
  data: string;

  @Column('varchar', { length: 255, nullable: true })
  action: string;

  @CreateDateColumn({ 
    type: 'timestamp', 
    precision: 0, 
    name: 'created_at',
    nullable: true 
  })
  createdAt: Date;

  @Column('varchar', { length: 39, nullable: true, name: 'ip_address' })
  ipAddress: string;

  @Column('varchar', { length: 17, nullable: true, name: 'target_id' })
  targetId: string;

  @Column('varchar', { length: 17, nullable: true, name: 'user_id' })
  userId: string;

  @Column('varchar', { length: 17, nullable: true, name: 'auth_token_id' })
  authTokenId: string;

  @Column('varchar', { length: 17, nullable: true, name: 'auth_log_record_id' })
  authLogRecordId: string;

  @Column('varchar', { length: 250, nullable: true, name: 'message' })
  message: string;

  // Relación con User
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;
}

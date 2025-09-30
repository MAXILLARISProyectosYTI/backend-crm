import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('files')
export class Files {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  parent_id: string;

  @Column({ type: 'varchar', length: 100 })
  parent_type: string;

  @Column({ type: 'varchar', length: 255 })
  file_name: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("opportunity_presave")
export class OpportunityPresave {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "espo_id", type: "varchar", length: 255, unique: true })
  espoId: string;

  @Column({ name: "document_number", type: "varchar", length: 20, nullable: true })
  documentNumber: string;

  @Column({ name: "name", type: "varchar", length: 255, nullable: true })
  name: string;

  @Column({ name: "last_name_father", type: "varchar", length: 255, nullable: true })
  lastNameFather: string;

  @Column({ name: "last_name_mother", type: "varchar", length: 255, nullable: true })
  lastNameMother: string;

  @Column({ name: "cellphone", type: "varchar", length: 20, nullable: true })
  cellphone: string;

  @Column({ name: "email", type: "varchar", length: 255, nullable: true })
  email: string;

  @Column({ name: "address", type: "varchar", length: 500, nullable: true })
  address: string;

  @Column({ name: "attorney", type: "varchar", length: 255, nullable: true })
  attorney: string;

  @Column({ name: "invoise_type_document", type: "varchar", length: 50, nullable: true })
  invoiseTypeDocument: string;

  @Column({ name: "invoise_num_document", type: "varchar", length: 50, nullable: true })
  invoiseNumDocument: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}


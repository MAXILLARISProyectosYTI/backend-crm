import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContractDateAndAmountToContractPresave1749360000000
  implements MigrationInterface
{
  name = 'AddContractDateAndAmountToContractPresave1749360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contract_presave
      ADD COLUMN IF NOT EXISTS contract_date varchar(10) NULL,
      ADD COLUMN IF NOT EXISTS fixed_payment_date varchar(10) NULL,
      ADD COLUMN IF NOT EXISTS contract_amount numeric(12, 2) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contract_presave
      DROP COLUMN IF EXISTS contract_date,
      DROP COLUMN IF EXISTS fixed_payment_date,
      DROP COLUMN IF EXISTS contract_amount
    `);
  }
}

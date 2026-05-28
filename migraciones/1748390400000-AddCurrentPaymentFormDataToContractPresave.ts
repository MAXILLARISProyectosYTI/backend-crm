import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCurrentPaymentFormDataToContractPresave1748390400000
  implements MigrationInterface
{
  name = 'AddCurrentPaymentFormDataToContractPresave1748390400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contract_presave
        ADD COLUMN IF NOT EXISTS current_payment_form_data TEXT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE contract_presave
        DROP COLUMN IF EXISTS current_payment_form_data
    `);
  }
}

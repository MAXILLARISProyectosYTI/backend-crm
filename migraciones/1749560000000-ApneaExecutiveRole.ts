import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rol CRM para ejecutivos en cola APNEA (cola usuarios activos + permisos FE).
 * Idempotente (ON CONFLICT DO NOTHING).
 */
export class ApneaExecutiveRole1749560000000 implements MigrationInterface {
  name = 'ApneaExecutiveRole1749560000000';

  private static readonly ROLE_ID = '6894ef4c093f180e0';
  private static readonly ROLE_NAME = 'ejecutivo_comercial_apnea';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "role" (id, name, deleted, created_at, modified_at)
      VALUES (
        '${ApneaExecutiveRole1749560000000.ROLE_ID}',
        '${ApneaExecutiveRole1749560000000.ROLE_NAME}',
        false,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "role"
      WHERE id = '${ApneaExecutiveRole1749560000000.ROLE_ID}'
    `);
  }
}

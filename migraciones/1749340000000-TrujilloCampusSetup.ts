import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sede Trujillo (campus_id = 16) — datos auxiliares en CRM.
 *
 * Idempotente (ON CONFLICT DO NOTHING). En producción ya existen:
 *   - team 68b755a5ae3790765 ("Equipo Trujillo")
 *   - campus_team (16 ↔ Equipo Trujillo)
 *   - assignment_queue_state campus 16 CONTROLES
 *
 * Esta migración solo agrega lo que falta:
 *   1. Coordenadas GPS en campus_coordinates (WhatsApp LOCATION)
 *   2. Rol "Controles Trujillo" para segmentación de ejecutivos
 */
export class TrujilloCampusSetup1749340000000 implements MigrationInterface {
  name = 'TrujilloCampusSetup1749340000000';

  private static readonly CAMPUS_ID = 16;
  private static readonly CONTROLES_TRUJILLO_ROLE_ID = '19d6e050866ecbd5d';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO campus_coordinates (campus_id, latitude, longitude)
      VALUES (${TrujilloCampusSetup1749340000000.CAMPUS_ID}, -8.1116, -79.0287)
      ON CONFLICT (campus_id) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "role" (id, name, deleted, created_at, modified_at)
      VALUES (
        '${TrujilloCampusSetup1749340000000.CONTROLES_TRUJILLO_ROLE_ID}',
        'Controles Trujillo',
        false,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM campus_coordinates
      WHERE campus_id = ${TrujilloCampusSetup1749340000000.CAMPUS_ID}
    `);

    await queryRunner.query(`
      DELETE FROM "role"
      WHERE id = '${TrujilloCampusSetup1749340000000.CONTROLES_TRUJILLO_ROLE_ID}'
    `);
  }
}

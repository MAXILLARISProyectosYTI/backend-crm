import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabla auxiliar campus_coordinates: coordenadas geográficas de cada sede.
 * Complementa los datos maestros que vienen del servicio SV.
 * Usado para templates WhatsApp con header LOCATION.
 */
export class CampusCoordinates1738685100000 implements MigrationInterface {
  name = 'CampusCoordinates1738685100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS campus_coordinates (
        campus_id   INTEGER PRIMARY KEY,
        latitude    DECIMAL(10, 7),
        longitude   DECIMAL(10, 7)
      )
    `);

    await queryRunner.query(`
      INSERT INTO campus_coordinates (campus_id, latitude, longitude) VALUES
        (1,  -12.046374, -77.042793),
        (15, -16.409047, -71.537451)
      ON CONFLICT (campus_id) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS campus_coordinates`);
  }
}

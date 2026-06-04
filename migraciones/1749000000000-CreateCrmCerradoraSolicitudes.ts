import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCrmCerradoraSolicitudes1749000000000 implements MigrationInterface {
  name = 'CreateCrmCerradoraSolicitudes1749000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS crm_cerradora_solicitudes (
        id SERIAL PRIMARY KEY,
        cerradora_username VARCHAR(100) NOT NULL,
        cerradora_nombre VARCHAR(255) NOT NULL,
        clinic_history_id INT NULL,
        paciente_nombre VARCHAR(255) NOT NULL,
        quotation_id INT NULL,
        tipo_solicitud VARCHAR(30) NOT NULL DEFAULT 'demora_contrato',
        motivo TEXT NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
        comentario_admin TEXT NULL,
        admin_username VARCHAR(100) NULL,
        firma_contrato VARCHAR(20) NOT NULL DEFAULT 'pendiente',
        fecha_contrato TIMESTAMP NULL,
        facturado BOOLEAN NOT NULL DEFAULT FALSE,
        monto DECIMAL(12,2) NULL,
        tipo_contrato VARCHAR(50) NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS crm_cerradora_solicitudes
    `);
  }
}

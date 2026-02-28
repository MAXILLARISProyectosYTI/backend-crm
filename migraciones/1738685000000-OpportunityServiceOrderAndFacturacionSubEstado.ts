import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabla opportunity_service_order (O.S asociadas a oportunidad) y columna c_facturacion_sub_estado en opportunity.
 * Se consulta GET invoice-mifact-v3/service-order/:serviceOrderId/invoice-status hasta que esté facturada.
 */
export class OpportunityServiceOrderAndFacturacionSubEstado1738685000000
  implements MigrationInterface
{
  name = 'OpportunityServiceOrderAndFacturacionSubEstado1738685000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS opportunity_service_order (
        id SERIAL PRIMARY KEY,
        opportunity_id VARCHAR(17) NOT NULL,
        service_order_id INTEGER NOT NULL,
        metadata TEXT NULL,
        facturado BOOLEAN NULL DEFAULT false,
        invoice_result_head_id INTEGER NULL,
        url_soles TEXT NULL,
        url_dolares TEXT NULL,
        last_checked_at TIMESTAMP WITH TIME ZONE NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_opportunity_service_order_opportunity_id ON opportunity_service_order(opportunity_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_opportunity_service_order_service_order_id ON opportunity_service_order(service_order_id)`,
    );
    await queryRunner.query(
      `COMMENT ON TABLE opportunity_service_order IS 'Órdenes de servicio asociadas a una oportunidad; se consulta invoice-status hasta que esté facturada.'`,
    );

    await queryRunner.query(`
      ALTER TABLE opportunity ADD COLUMN IF NOT EXISTS c_facturacion_sub_estado VARCHAR(60) NULL
    `);
    await queryRunner.query(
      `COMMENT ON COLUMN opportunity.c_facturacion_sub_estado IS 'Sub-estado de facturación: factura_directa, orden_servicio_pendiente_factura o NULL.'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_opportunity_service_order_opportunity_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_opportunity_service_order_service_order_id`);
    await queryRunner.query(`DROP TABLE IF EXISTS opportunity_service_order`);
    await queryRunner.query(
      `ALTER TABLE opportunity DROP COLUMN IF EXISTS c_facturacion_sub_estado`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marca explícita en la oportunidad para indicar que fue creada como
 * "referido" desde el botón "¡Empezar! ✨" (NewClientCard, flujo
 * createWithSamePhoneNumber).
 *
 * Necesario porque sv-backend-main (clinic-history-crm.service.ts
 * #getRedirectByOpportunityId) infiere el paciente por número de teléfono
 * cuando la oportunidad no tiene cClinicHistory. En el caso de un referido
 * (familiar que comparte teléfono pero es OTRO paciente) eso precarga al
 * paciente original y rompe el flujo del NO.
 *
 * Cuando este flag está en TRUE, el SV NO ejecuta la búsqueda por phone y
 * devuelve dataPatient = null para forzar al frontend a abrir el formulario
 * vacío de creación de paciente.
 *
 * Backfill defensivo: oportunidades históricas cuyo nombre termine en
 * " REF-N" (creadas por el mismo flujo antes de existir esta columna)
 * quedan marcadas como referido para que el comportamiento sea consistente.
 */
export class OpportunityReferralCreationFlag1746820000000 implements MigrationInterface {
  name = 'OpportunityReferralCreationFlag1746820000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE opportunity
        ADD COLUMN IF NOT EXISTS c_is_referral_creation BOOLEAN DEFAULT false
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN opportunity.c_is_referral_creation IS
        'TRUE cuando la oportunidad fue creada por createWithSamePhoneNumber (botón "¡Empezar!" para registrar otro paciente con el mismo teléfono). El SV usa este flag para NO precargar el paciente original.'
    `);

    await queryRunner.query(`
      UPDATE opportunity
         SET c_is_referral_creation = true
       WHERE c_is_referral_creation IS DISTINCT FROM true
         AND name ~ ' REF-[0-9]+$'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE opportunity
        DROP COLUMN IF EXISTS c_is_referral_creation
    `);
  }
}

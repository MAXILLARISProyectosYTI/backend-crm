/**
 * Sincroniza incidencias CRM → SV (Historia clínica).
 *
 * Uso:
 *   npm run incidencias:sync-sv:dry   # solo lista pendientes, no toca SV
 *   npm run incidencias:sync-sv       # migra todas las filas con sv_issue_id NULL
 *
 * Requisitos:
 *   - .env con DB_* y credenciales SV (igual que el backend)
 *   - sv-backend con POST /contract/ensure-for-incidents desplegado
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { IncidenciasService } from '../src/incidencias/incidencias.service';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const service = app.get(IncidenciasService);
    const result = await service.syncPendingToSv({ dryRun });

    console.log('\n--- Resultado sync incidencias CRM → SV ---');
    console.log(`Modo:        ${dryRun ? 'DRY-RUN (sin cambios en SV)' : 'EJECUCIÓN'}`);
    console.log(`Pendientes:  ${result.total}`);
    if (!dryRun) {
      console.log(`Sincronizadas: ${result.synced}`);
      console.log(`Fallidas:      ${result.failed}`);
    }
    if (result.normalizedAreas > 0) {
      console.log(`Áreas corregidas: ${result.normalizedAreas}`);
    }

    if (result.items.length > 0) {
      console.log('\nDetalle:');
      for (const item of result.items) {
        const extra =
          item.status === 'synced'
            ? ` → SV #${item.svIssueId}`
            : item.error
              ? ` — ${item.error}`
              : '';
        console.log(
          `  #${item.crmId} paciente ${item.pacienteId} (${item.pacienteNombre}): ${item.titulo.slice(0, 60)}${item.titulo.length > 60 ? '…' : ''} [${item.status}]${extra}`,
        );
      }
    }

    if (!dryRun && result.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});

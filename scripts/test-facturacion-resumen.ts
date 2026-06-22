import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { CommissionsService } from '../src/commissions/commissions.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const service = app.get(CommissionsService);
    console.log("Fetching getCerradorasFacturacionResumen for 2026-06 (All campuses)...");
    const allRes = await service.getCerradorasFacturacionResumen(2026, 6, undefined);
    console.log("ALL CAMPUSES SUMMARY:");
    console.log(`totalFacturadoUsd: ${allRes.totalFacturadoUsd}`);
    console.log(`totalOs: ${allRes.totalOs}`);
    console.log(`items count: ${allRes.items.length}`);
    console.log("Items details:");
    allRes.items.forEach(it => {
      console.log(` - User: ${it.userName} (${it.userId}), Campus: ${it.campusId}, OS: ${it.osCount}, Total USD: ${it.totalUsd}`);
    });

    console.log("\nFetching getCerradorasFacturacionResumen for 2026-06 (Arequipa = 15)...");
    const aqpRes = await service.getCerradorasFacturacionResumen(2026, 6, 15);
    console.log("AREQUIPA SUMMARY:");
    console.log(`totalFacturadoUsd: ${aqpRes.totalFacturadoUsd}`);
    console.log(`totalOs: ${aqpRes.totalOs}`);
    console.log(`items count: ${aqpRes.items.length}`);
    aqpRes.items.forEach(it => {
      console.log(` - User: ${it.userName} (${it.userId}), Campus: ${it.campusId}, OS: ${it.osCount}, Total USD: ${it.totalUsd}`);
    });

    console.log("\nFetching getCerradorasFacturacionResumen for 2026-06 (Trujillo = 16)...");
    const trjRes = await service.getCerradorasFacturacionResumen(2026, 6, 16);
    console.log("TRUJILLO SUMMARY:");
    console.log(`totalFacturadoUsd: ${trjRes.totalFacturadoUsd}`);
    console.log(`totalOs: ${trjRes.totalOs}`);
    console.log(`items count: ${trjRes.items.length}`);
    trjRes.items.forEach(it => {
      console.log(` - User: ${it.userName} (${it.userId}), Campus: ${it.campusId}, OS: ${it.osCount}, Total USD: ${it.totalUsd}`);
    });

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

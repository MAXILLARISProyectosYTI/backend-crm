import { DataSource } from 'typeorm';
import { join } from 'path';

// .env se carga con node -r dotenv/config en el script npm
const host = process.env.DB_HOST || 'localhost';
const port = parseInt(process.env.DB_PORT || '5432', 10);
const username = process.env.DB_USERNAME || 'postgres';
const password = typeof process.env.DB_PASSWORD === 'string' ? process.env.DB_PASSWORD : '';
const database = process.env.DB_DATABASE || 'crm_maxillaris';

console.log('[migration] Conexión BBDD (desde .env):', {
  host,
  port,
  username,
  database,
  passwordLoaded: password.length > 0 ? `*** (${password.length} caracteres)` : 'NO',
});

const migrationsDir = join(process.cwd(), 'migraciones');

export default new DataSource({
  type: 'postgres',
  host,
  port,
  username,
  password,
  database,
  migrations: [
    join(migrationsDir, '1738684800000-ConsolidateMigraciones.ts'),
    join(migrationsDir, '1738684900000-OpportunityPresaveFilesContractPresave.ts'),
    join(migrationsDir, '1738685000000-OpportunityServiceOrderAndFacturacionSubEstado.ts'),
  ],
  migrationsTableName: 'migrations',
});

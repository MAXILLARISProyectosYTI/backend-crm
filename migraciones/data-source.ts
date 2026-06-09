import { DataSource } from 'typeorm';
import { readdirSync } from 'fs';
import { join } from 'path';

// .env se carga con node -r dotenv/config en el script npm
const host = process.env.DB_HOST || 'localhost';
const port = parseInt(process.env.DB_PORT || '5432', 10);
const username = process.env.DB_USERNAME || 'postgres';
const password = typeof process.env.DB_PASSWORD === 'string' ? process.env.DB_PASSWORD : '';
const database = process.env.DB_DATABASE || 'crm_maxillaris';

const migrationsDir = join(process.cwd(), 'migraciones');

/** Carga automática de migraciones TypeORM: archivos `TIMESTAMP-Nombre.ts` en /migraciones */
function loadMigrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((file) => /^\d+-.+\.ts$/.test(file))
    .sort()
    .map((file) => join(migrationsDir, file));
}

const migrationFiles = loadMigrationFiles();

console.log('[migration] Conexión BBDD (desde .env):', {
  host,
  port,
  username,
  database,
  passwordLoaded: password.length > 0 ? `*** (${password.length} caracteres)` : 'NO',
  migrationsCount: migrationFiles.length,
  pendingFiles: migrationFiles.map((f) => f.split('/').pop()),
});

export default new DataSource({
  type: 'postgres',
  host,
  port,
  username,
  password,
  database,
  migrations: migrationFiles,
  migrationsTableName: 'migrations',
});

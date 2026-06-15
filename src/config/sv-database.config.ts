import { registerAs } from '@nestjs/config';

export interface SvDatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

function stripEnvQuotes(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/^['"]|['"]$/g, '');
}

/** ¿Estamos en prod? Por NODE_ENV o por la BD CRM ya configurada. */
export function isCrmProductionEnv(): boolean {
  const dbHost = process.env.DB_HOST ?? '';
  const dbName = process.env.DB_DATABASE ?? '';
  return process.env.NODE_ENV === 'production'
    || dbHost === '161.132.199.230'
    || dbName === 'crm';
}

/**
 * Credenciales BD SV (invoice) sin SV_DB_* obligatorios.
 * - Prod: detecta solo → maxi_dev @ 161.132.199.230:5432 (reusa DB_PASSWORD del CRM si existe).
 * - Dev: sv_dev @ 161.132.211.235:5501 con defaults conocidos.
 */
export function resolveSvDatabaseConfig(): SvDatabaseConfig {
  const isProd = isCrmProductionEnv();

  if (isProd) {
    return {
      host: process.env.SV_DB_HOST || process.env.DB_HOST || '161.132.199.230',
      port: parseInt(process.env.SV_DB_PORT || '5432', 10),
      username: process.env.SV_DB_USERNAME || process.env.DB_USERNAME || 'postgres',
      password: stripEnvQuotes(
        process.env.SV_DB_PASSWORD
        || process.env.DB_PASSWORD
        || '8Do$oO3&3gcD',
      ),
      database: process.env.SV_DB_DATABASE || 'maxi_dev',
    };
  }

  return {
    host: process.env.SV_DB_HOST || '161.132.211.235',
    port: parseInt(process.env.SV_DB_PORT || '5501', 10),
    username: process.env.SV_DB_USERNAME || 'desarrollador_dev_maxillaris',
    password: stripEnvQuotes(process.env.SV_DB_PASSWORD || 'hq75TCdbiJzhfr7lXt3w'),
    database: process.env.SV_DB_DATABASE || 'sv_dev',
  };
}

export default registerAs('svDatabase', resolveSvDatabaseConfig);

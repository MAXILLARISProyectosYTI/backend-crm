import { Client } from 'pg';
import { resolveSvDatabaseConfig } from '../../config/sv-database.config';

/** Cliente PostgreSQL → BD SV (invoice_result_*). */
export function createSvDbClient(): Client {
  const cfg = resolveSvDatabaseConfig();
  if (!cfg.password) {
    throw new Error(
      'SV_DB_PASSWORD no configurado. En producción usar maxi_dev @ 161.132.199.230:5432',
    );
  }
  return new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.username,
    password: cfg.password,
    database: cfg.database,
    connectionTimeoutMillis: 15000,
  });
}

export { resolveSvDatabaseConfig };

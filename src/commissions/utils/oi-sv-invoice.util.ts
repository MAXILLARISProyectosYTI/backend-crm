import { Client } from 'pg';
import { guardPgClient } from '../../config/pg-client-guard';
import { resolveSvDatabaseConfig } from '../../config/sv-database.config';

/** Cliente PostgreSQL → BD SV (invoice_result_*). */
export function createSvDbClient(): Client {
  const cfg = resolveSvDatabaseConfig();
  if (!cfg.password) {
    throw new Error(
      'SV_DB_PASSWORD no configurado. En producción usar maxi_dev @ 161.132.199.230:5432',
    );
  }
  return guardPgClient(new Client({
    host: cfg.host,
    port: cfg.port,
    user: cfg.username,
    password: cfg.password,
    database: cfg.database,
    connectionTimeoutMillis: 15000,
  }), 'oi-sv-invoice');
}

export { resolveSvDatabaseConfig };

import { Logger } from '@nestjs/common';
import type { Client } from 'pg';

const logger = new Logger('PgClient');

/**
 * Un `pg.Client` suelto sin listener 'error' tumba el proceso de Node cuando la BD
 * corta la conexión (p. ej. 57P01 "terminating connection due to administrator command").
 * Los errores de las queries siguen llegando por sus propias promesas.
 */
export function guardPgClient(
  client: Client,
  label: string,
  onError?: (err: Error) => void,
): Client {
  client.on('error', (err: Error) => {
    logger.error(`[${label}] conexión SV interrumpida: ${err.message}`);
    onError?.(err);
  });
  return client;
}

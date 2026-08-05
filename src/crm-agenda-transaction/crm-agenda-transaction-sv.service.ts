import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import { createHash, randomUUID } from 'crypto';
import {
  CrmAgendaTransactionStatus,
  CrmAgendaTransactionStep,
} from './crm-agenda-transaction.constants';
import {
  resolveSvDatabaseConfig,
  type SvDatabaseConfig,
} from '../config/sv-database.config';

const IN_PROGRESS_TTL_MS = 5 * 60 * 1000;

export interface ExecuteIdempotentParams<T> {
  correlationId: string;
  idempotencyKey: string;
  espoId?: string | null;
  step: CrmAgendaTransactionStep;
  requestPayload?: unknown;
  handler: () => Promise<T>;
  extractIds?: (result: T) => {
    reservationId?: number | null;
    paymentId?: number | null;
    patientId?: number | null;
  };
}

@Injectable()
export class CrmAgendaTransactionSvService implements OnModuleDestroy {
  private readonly logger = new Logger(CrmAgendaTransactionSvService.name);
  private client: Client | null = null;
  private readonly svConfig: SvDatabaseConfig;

  constructor(private readonly configService: ConfigService) {
    this.svConfig =
      this.configService.get<SvDatabaseConfig>('svDatabase') ??
      resolveSvDatabaseConfig();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.end().catch(() => undefined);
  }

  resolveCorrelationId(headerValue?: string | null): string {
    const trimmed = headerValue?.trim();
    if (trimmed && /^[0-9a-f-]{36}$/i.test(trimmed)) {
      return trimmed;
    }
    return randomUUID();
  }

  buildRequestHash(payload: unknown): string | null {
    if (payload === undefined || payload === null) return null;
    try {
      return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    } catch {
      return null;
    }
  }

  async executeIdempotent<T>(params: ExecuteIdempotentParams<T>): Promise<{
    data: T;
    replayed: boolean;
    correlationId: string;
    idempotencyKey: string;
  }> {
    const pg = await this.getClient();
    const {
      correlationId,
      idempotencyKey,
      espoId,
      step,
      requestPayload,
      handler,
      extractIds,
    } = params;
    const requestHash = this.buildRequestHash(requestPayload);

    const existing = await pg.query(
      `SELECT * FROM crm_agenda_transaction WHERE idempotency_key = $1 LIMIT 1`,
      [idempotencyKey],
    );

    if (existing.rows[0]) {
      const row = existing.rows[0] as Record<string, unknown>;
      const status = String(row.status);
      // Reintento seguro tras fallo: reclaim del PENDING y re-ejecutar handler.
      // Sin esto, un SYNC_CRM FAILED (p. ej. colisión de key con SV) bloquea
      // todos los reintentos con el mismo payload.
      if (
        status === CrmAgendaTransactionStatus.FAILED &&
        row.retry_safe !== false
      ) {
        const claimed = await pg.query(
          `UPDATE crm_agenda_transaction SET
             status = $2,
             error_code = NULL,
             error_message = NULL,
             updated_at = NOW()
           WHERE idempotency_key = $1 AND status = $3
           RETURNING idempotency_key`,
          [
            idempotencyKey,
            CrmAgendaTransactionStatus.PENDING,
            CrmAgendaTransactionStatus.FAILED,
          ],
        );
        if (!claimed.rows[0]) {
          return this.handleExisting(row, correlationId, idempotencyKey, requestHash);
        }
        // cae al try/handler de abajo
      } else {
        return this.handleExisting(row, correlationId, idempotencyKey, requestHash);
      }
    } else {
      await pg.query(
        `INSERT INTO crm_agenda_transaction
          (correlation_id, idempotency_key, espo_id, step, status, request_hash, retry_safe)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
        [correlationId, idempotencyKey, espoId ?? null, step, CrmAgendaTransactionStatus.PENDING, requestHash],
      );
    }

    try {
      const data = await handler();
      const ids = extractIds?.(data) ?? {};
      await pg.query(
        `UPDATE crm_agenda_transaction SET
          status = $2,
          response_snapshot = $3::jsonb,
          reservation_id = $4,
          payment_id = $5,
          patient_id = $6,
          error_code = NULL,
          error_message = NULL,
          updated_at = NOW()
         WHERE idempotency_key = $1`,
        [
          idempotencyKey,
          CrmAgendaTransactionStatus.SUCCESS,
          JSON.stringify(data ?? {}),
          ids.reservationId ?? null,
          ids.paymentId ?? null,
          ids.patientId ?? null,
        ],
      );
      return { data, replayed: false, correlationId, idempotencyKey };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await pg.query(
        `UPDATE crm_agenda_transaction SET
          status = $2, error_code = $3, error_message = $4, updated_at = NOW()
         WHERE idempotency_key = $1`,
        [idempotencyKey, CrmAgendaTransactionStatus.FAILED, 'TRANSACTION_FAILED', message],
      );
      throw error;
    }
  }

  async getStatusByCorrelationId(correlationId: string) {
    const pg = await this.getClient();
    const result = await pg.query(
      `SELECT * FROM crm_agenda_transaction WHERE correlation_id = $1 ORDER BY created_at ASC`,
      [correlationId],
    );
    const rows = result.rows;
    if (!rows.length) {
      return { correlationId, found: false, steps: [], overallStatus: null };
    }
    const overallStatus = rows.some((r) => r.status === 'FAILED')
      ? 'FAILED'
      : rows.some((r) => r.status === 'PARTIAL')
        ? 'PARTIAL'
        : rows.some((r) => r.status === 'PENDING')
          ? 'PENDING'
          : 'SUCCESS';

    return {
      correlationId,
      found: true,
      espoId: rows.find((r) => r.espo_id)?.espo_id ?? null,
      overallStatus,
      steps: rows.map((row) => ({
        step: row.step,
        status: row.status,
        idempotencyKey: row.idempotency_key,
        reservationId: row.reservation_id,
        paymentId: row.payment_id,
        patientId: row.patient_id,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        retrySafe: row.retry_safe,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    };
  }

  private async handleExisting<T>(
    row: Record<string, unknown>,
    correlationId: string,
    idempotencyKey: string,
    requestHash: string | null,
  ): Promise<{ data: T; replayed: boolean; correlationId: string; idempotencyKey: string }> {
    const status = String(row.status);
    const createdAt = new Date(String(row.created_at));

    if (status === CrmAgendaTransactionStatus.PENDING && Date.now() - createdAt.getTime() < IN_PROGRESS_TTL_MS) {
      const err: any = new Error('Transacción en progreso');
      err.status = 409;
      err.response = {
        correlationId,
        idempotencyKey,
        errorCode: 'IDEMPOTENCY_IN_PROGRESS',
        retrySafe: true,
      };
      throw err;
    }

    if (status === CrmAgendaTransactionStatus.SUCCESS) {
      if (requestHash && row.request_hash && row.request_hash !== requestHash) {
        const err: any = new Error('Idempotency-Key con payload distinto');
        err.status = 409;
        throw err;
      }
      return {
        data: (row.response_snapshot ?? {}) as T,
        replayed: true,
        correlationId: String(row.correlation_id),
        idempotencyKey,
      };
    }

    const err: any = new Error(String(row.error_message ?? 'Transacción previa fallida'));
    err.status = 409;
    err.response = {
      correlationId,
      idempotencyKey,
      errorCode: status === 'PARTIAL' ? 'TRANSACTION_PARTIAL' : 'TRANSACTION_FAILED',
      existingResult: row.response_snapshot,
      retrySafe: row.retry_safe,
    };
    throw err;
  }

  private async getClient(): Promise<Client> {
    if (this.client) return this.client;
    this.client = new Client({
      host: this.svConfig.host,
      port: this.svConfig.port,
      user: this.svConfig.username,
      password: this.svConfig.password,
      database: this.svConfig.database,
    });
    await this.client.connect();
    this.logger.log(`Conectado a BD SV para transacciones CRM-Agenda (${this.svConfig.database})`);
    return this.client;
  }
}

import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { MetricTotalDto } from './dto/export.dto';

export interface ExportJobRow {
  id: string;
  requested_by: string;
  export_type: string;
  format: string;
  status: string;
  filters: Record<string, unknown>; // { requestFilters: ReportFilters, totals?: MetricTotalDto[] } — see note below
  filter_fingerprint: string;
  sensitive: boolean;
  customer_id: string | null;
  row_count: number | null;
  object_storage_key: string | null;
  failure_message: string | null;
  completed_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface DownloadAuthorizationDetailRow {
  id: string;
  issued_to: string;
  expires_at: Date;
  object_storage_key: string;
  export_type: string;
  format: string;
}

const EXPORT_JOB_SELECT = `
  id, requested_by, export_type, format, status, filters, filter_fingerprint, sensitive,
  customer_id, row_count, object_storage_key, failure_message, completed_at, expires_at,
  created_at, updated_at`;

/**
 * export_jobs (schema.sql, frozen) has no dedicated `totals` column — only `filters JSONB`. Since
 * the schema cannot be modified, the ExportJob.totals reconciliation data (Metric[]) is nested
 * inside that same JSONB value alongside the actual request filters, under a `totals` key never
 * exposed as-is: readers always unpack it back into `filters`/`totals` via the row mapper.
 */
export function packFiltersColumn(requestFilters: object, totals?: MetricTotalDto[]): string {
  return JSON.stringify({ requestFilters, ...(totals ? { totals } : {}) });
}

export function unpackFiltersColumn(value: Record<string, unknown>): { requestFilters: Record<string, unknown>; totals?: MetricTotalDto[] } {
  return {
    requestFilters: (value.requestFilters as Record<string, unknown>) ?? {},
    totals: value.totals as MetricTotalDto[] | undefined,
  };
}

@Injectable()
export class ExportsRepository {
  constructor(private readonly db: DatabaseService) {}

  async insert(
    client: PoolClient,
    data: {
      requestedBy: string;
      exportType: string;
      format: string;
      filtersJson: string;
      filterFingerprint: string;
      sensitive: boolean;
      customerId?: string;
    },
  ): Promise<ExportJobRow> {
    const result = await client.query<ExportJobRow>(
      `INSERT INTO export_jobs (requested_by, export_type, format, status, filters, filter_fingerprint, sensitive, customer_id)
       VALUES ($1, $2, $3, 'PENDING', $4::jsonb, $5, $6, $7)
       RETURNING ${EXPORT_JOB_SELECT}`,
      [data.requestedBy, data.exportType, data.format, data.filtersJson, data.filterFingerprint, data.sensitive, data.customerId ?? null],
    );
    return result.rows[0];
  }

  async findById(exportJobId: string): Promise<ExportJobRow | null> {
    const result = await this.db.query<ExportJobRow>(
      `SELECT ${EXPORT_JOB_SELECT} FROM export_jobs WHERE id = $1`,
      [exportJobId],
    );
    return result.rows[0] ?? null;
  }

  async markProcessing(id: string): Promise<void> {
    await this.db.execute(`UPDATE export_jobs SET status = 'PROCESSING' WHERE id = $1 AND status = 'PENDING'`, [id]);
  }

  async markCompleted(
    id: string,
    data: { rowCount: number; objectStorageKey: string; completedAt: Date; expiresAt: Date; filtersJson: string },
  ): Promise<void> {
    await this.db.execute(
      `UPDATE export_jobs
       SET status = 'COMPLETED', row_count = $2, object_storage_key = $3, completed_at = $4::timestamptz,
           expires_at = $5::timestamptz, filters = $6::jsonb
       WHERE id = $1`,
      [id, data.rowCount, data.objectStorageKey, data.completedAt.toISOString(), data.expiresAt.toISOString(), data.filtersJson],
    );
  }

  async markFailed(id: string, failureMessage: string): Promise<void> {
    await this.db.execute(`UPDATE export_jobs SET status = 'FAILED', failure_message = $2 WHERE id = $1`, [id, failureMessage]);
  }

  async markExpired(id: string): Promise<void> {
    await this.db.execute(`UPDATE export_jobs SET status = 'EXPIRED' WHERE id = $1`, [id]);
  }

  async list(
    requestedBy: string,
    query: { page: number; pageSize: number; sort?: string; status?: string; exportType?: string },
  ): Promise<{ rows: ExportJobRow[]; totalItems: number }> {
    const params: unknown[] = [requestedBy];
    const conditions = ['requested_by = $1'];
    if (query.status) { params.push(query.status); conditions.push(`status = $${params.length}`); }
    if (query.exportType) { params.push(query.exportType); conditions.push(`export_type = $${params.length}`); }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const effectiveSort = query.sort ?? '-createdAt';
    const direction = effectiveSort.startsWith('-') ? 'DESC' : 'ASC';
    const field = effectiveSort.replace(/^-/, '');
    if (field !== 'createdAt') throw new Error('INVALID_SORT');

    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(`SELECT count(*)::int AS count FROM export_jobs ${where}`, params);
    const rows = await this.db.query<ExportJobRow>(
      `SELECT ${EXPORT_JOB_SELECT} FROM export_jobs ${where}
       ORDER BY created_at ${direction}, id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }

  async insertDownloadAuthorization(
    client: PoolClient,
    data: { exportJobId: string; issuedTo: string; expiresAt: Date },
  ): Promise<{ id: string; expires_at: Date }> {
    const result = await client.query<{ id: string; expires_at: Date }>(
      `INSERT INTO download_authorizations (export_job_id, issued_to, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, expires_at`,
      [data.exportJobId, data.issuedTo, data.expiresAt],
    );
    return result.rows[0];
  }

  async customerAccessible(customerId: string, scopeIds: string[]): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM customers WHERE id = $1 AND organization_scope_id = ANY($2::uuid[])`,
      [customerId, scopeIds],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findDownloadAuthorization(authorizationId: string): Promise<DownloadAuthorizationDetailRow | null> {
    const result = await this.db.query<DownloadAuthorizationDetailRow>(
      `SELECT da.id, da.issued_to, da.expires_at, ej.object_storage_key, ej.export_type, ej.format
       FROM download_authorizations da
       JOIN export_jobs ej ON ej.id = da.export_job_id
       WHERE da.id = $1`,
      [authorizationId],
    );
    return result.rows[0] ?? null;
  }
}

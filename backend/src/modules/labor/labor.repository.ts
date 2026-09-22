import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { LaborEntryListQuery } from './dto/labor.dto';

export interface LaborEntryRow {
  id: string;
  job_id: string;
  work_item_id: string | null;
  technician_id: string;
  work_date: Date;
  duration_minutes: number;
  description: string | null;
  hourly_rate_amount: string;
  hourly_rate_currency: string;
  amount: string;
  amount_currency: string;
  status: 'ACTIVE' | 'VOIDED';
  void_reason: string | null;
  voided_at: Date | null;
  voided_by: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

const LABOR_ENTRY_SELECT = `
  id, job_id, work_item_id, technician_id, work_date, duration_minutes, description,
  hourly_rate_amount, hourly_rate_currency, amount, amount_currency, status,
  void_reason, voided_at, voided_by, created_at, updated_at, created_by, updated_by`;

const LABOR_SORT_FIELDS: Record<string, string> = { workDate: 'work_date', createdAt: 'created_at' };

function orderBy(sort: string | undefined, fields: Record<string, string>, defaultSort: string): string {
  const requested = sort?.split(',') ?? [defaultSort];
  return requested.map((part) => {
    const descending = part.startsWith('-');
    const field = fields[descending ? part.slice(1) : part];
    if (!field) throw new Error('INVALID_SORT');
    return `${field} ${descending ? 'DESC' : 'ASC'}`;
  }).join(', ');
}

@Injectable()
export class LaborRepository {
  constructor(private readonly db: DatabaseService) {}

  async findFinanceSettings(client: PoolClient): Promise<{ labor_hourly_rate: string; currency_code: string }> {
    const result = await client.query<{ labor_hourly_rate: string; currency_code: string }>(
      `SELECT labor_hourly_rate, currency_code FROM finance_settings WHERE id = TRUE`,
    );
    return result.rows[0];
  }

  async hasApprovedAdditionalWorkApproval(client: PoolClient, workItemId: string): Promise<boolean> {
    const result = await client.query(
      `SELECT 1 FROM job_approval_work_items jwi
       JOIN job_approvals ja ON ja.id = jwi.approval_id
       WHERE jwi.work_item_id = $1 AND ja.scope = 'ADDITIONAL_WORK' AND ja.status = 'APPROVED'
       LIMIT 1`,
      [workItemId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async computeAmount(client: PoolClient, hourlyRateAmount: string, durationMinutes: number): Promise<string> {
    const result = await client.query<{ amount: string }>(
      `SELECT ROUND($1::numeric * $2::numeric / 60, 4) AS amount`,
      [hourlyRateAmount, durationMinutes],
    );
    return result.rows[0].amount;
  }

  async create(
    client: PoolClient,
    data: {
      jobId: string;
      workItemId?: string;
      technicianId: string;
      workDate: string;
      durationMinutes: number;
      description?: string;
      hourlyRateAmount: string;
      hourlyRateCurrency: string;
      amount: string;
      actor: string;
    },
  ): Promise<LaborEntryRow> {
    const result = await client.query<LaborEntryRow>(
      `INSERT INTO labor_entries
         (job_id, work_item_id, technician_id, work_date, duration_minutes, description,
          hourly_rate_amount, hourly_rate_currency, amount, amount_currency, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $8, 'ACTIVE', $10, $10)
       RETURNING ${LABOR_ENTRY_SELECT}`,
      [
        data.jobId, data.workItemId ?? null, data.technicianId, data.workDate, data.durationMinutes,
        data.description ?? null, data.hourlyRateAmount, data.hourlyRateCurrency, data.amount, data.actor,
      ],
    );
    return result.rows[0];
  }

  async findLocked(client: PoolClient, jobId: string, laborEntryId: string): Promise<LaborEntryRow | null> {
    const result = await client.query<LaborEntryRow>(
      `SELECT ${LABOR_ENTRY_SELECT} FROM labor_entries WHERE id = $1 AND job_id = $2 FOR UPDATE`,
      [laborEntryId, jobId],
    );
    return result.rows[0] ?? null;
  }

  async update(client: PoolClient, laborEntryId: string, values: Record<string, unknown>, actor: string): Promise<LaborEntryRow | null> {
    const entries = Object.entries(values);
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
    const actorParameter = entries.length + 1;
    const idParameter = entries.length + 2;
    const result = await client.query<LaborEntryRow>(
      `UPDATE labor_entries SET ${assignments}, updated_by = $${actorParameter}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idParameter}
       RETURNING ${LABOR_ENTRY_SELECT}`,
      [...entries.map(([, value]) => value), actor, laborEntryId],
    );
    return result.rows[0] ?? null;
  }

  async void(client: PoolClient, laborEntryId: string, reason: string, actor: string): Promise<LaborEntryRow | null> {
    const result = await client.query<LaborEntryRow>(
      `UPDATE labor_entries
       SET status = 'VOIDED', void_reason = $1, voided_at = CURRENT_TIMESTAMP, voided_by = $2,
           updated_by = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING ${LABOR_ENTRY_SELECT}`,
      [reason, actor, laborEntryId],
    );
    return result.rows[0] ?? null;
  }

  async list(jobId: string, query: LaborEntryListQuery) {
    const where = ['job_id = $1'];
    const params: unknown[] = [jobId];
    if (query.status) {
      params.push(query.status);
      where.push(`status = $${params.length}`);
    }
    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM labor_entries ${condition}`,
      params,
    );
    const rows = await this.db.query<LaborEntryRow>(
      `SELECT ${LABOR_ENTRY_SELECT} FROM labor_entries ${condition}
       ORDER BY ${orderBy(query.sort, LABOR_SORT_FIELDS, 'workDate')}, id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}

import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { BayCalendarQuery, BayListQuery } from './dto/bay.dto';

export interface BayRow {
  id: string;
  organization_scope_id: string;
  code: string;
  name: string;
  capacity: number;
  status: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE';
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface CalendarRow {
  kind: 'JOB' | 'TRAINING_SESSION';
  reference_id: string;
  reference_label: string;
  starts_at: Date;
  ends_at: Date;
}

const BAY_SELECT = `
  b.id, b.organization_scope_id, b.code, b.name, b.capacity, b.status,
  b.created_at, b.updated_at, b.created_by, b.updated_by`;

const SORT_FIELDS: Record<string, string> = {
  code: 'b.code',
  name: 'b.name',
};

function orderBy(sort?: string): string {
  const requested = sort?.split(',') ?? ['code'];
  return requested.map((part) => {
    const descending = part.startsWith('-');
    const field = SORT_FIELDS[descending ? part.slice(1) : part];
    if (!field) throw new Error('INVALID_SORT');
    return `${field} ${descending ? 'DESC' : 'ASC'}`;
  }).join(', ');
}

@Injectable()
export class BaysRepository {
  constructor(private readonly db: DatabaseService) {}

  async findActiveScope(client: PoolClient, scopeId: string): Promise<boolean> {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM organization_scopes WHERE id = $1 AND status = 'ACTIVE' FOR SHARE`,
      [scopeId],
    );
    return result.rowCount === 1;
  }

  async findScoped(
    bayId: string,
    scopeIds: string[],
    client?: PoolClient,
    lock = false,
  ): Promise<BayRow | null> {
    const sql = `SELECT ${BAY_SELECT}
      FROM bays b
      JOIN organization_scopes os ON os.id = b.organization_scope_id AND os.status = 'ACTIVE'
      WHERE b.id = $1 AND b.organization_scope_id = ANY($2::uuid[])${lock ? ' FOR UPDATE OF b' : ''}`;
    const result = client
      ? await client.query<BayRow>(sql, [bayId, scopeIds])
      : await this.db.query<BayRow>(sql, [bayId, scopeIds]);
    return result.rows[0] ?? null;
  }

  async create(
    client: PoolClient,
    data: { organizationScopeId: string; code: string; name: string; capacity: number; actor: string },
  ): Promise<BayRow> {
    const result = await client.query<BayRow>(
      `INSERT INTO bays
       (organization_scope_id, code, name, capacity, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $5)
       RETURNING ${BAY_SELECT.replaceAll('b.', '')}`,
      [data.organizationScopeId, data.code, data.name, data.capacity, data.actor],
    );
    return result.rows[0];
  }

  async update(
    client: PoolClient,
    bayId: string,
    values: Record<string, unknown>,
    actor: string,
  ): Promise<BayRow | null> {
    const entries = Object.entries(values);
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
    const actorParameter = entries.length + 1;
    const idParameter = entries.length + 2;
    const result = await client.query<BayRow>(
      `UPDATE bays
       SET ${assignments}, updated_by = $${actorParameter}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idParameter}
       RETURNING ${BAY_SELECT.replaceAll('b.', '')}`,
      [...entries.map(([, value]) => value), actor, bayId],
    );
    return result.rows[0] ?? null;
  }

  async list(query: BayListQuery, scopeIds: string[]): Promise<{ rows: BayRow[]; totalItems: number }> {
    const where = [
      'b.organization_scope_id = ANY($1::uuid[])',
      `EXISTS (SELECT 1 FROM organization_scopes os
              WHERE os.id = b.organization_scope_id AND os.status = 'ACTIVE')`,
    ];
    const params: unknown[] = [scopeIds];
    if (query.status) {
      params.push(query.status);
      where.push(`b.status = $${params.length}`);
    }
    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM bays b ${condition}`,
      params,
    );
    const rows = await this.db.query<BayRow>(
      `SELECT ${BAY_SELECT} FROM bays b ${condition}
       ORDER BY ${orderBy(query.sort)}, b.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }

  async calendar(
    bayId: string,
    query: BayCalendarQuery,
  ): Promise<CalendarRow[]> {
    return (await this.db.query<CalendarRow>(
      `SELECT kind, reference_id, reference_label, starts_at, ends_at
       FROM (
         SELECT 'JOB'::text AS kind, j.id AS reference_id, j.job_number AS reference_label,
                j.scheduled_start_at AS starts_at, j.expected_completion_at AS ends_at
         FROM job_cards j
         WHERE j.bay_id = $1
           AND j.stage IN ('RECEIVED', 'IN_PROGRESS', 'QUALITY_CHECK')
           AND j.scheduled_start_at IS NOT NULL
           AND j.scheduled_start_at < $3::timestamptz
           AND j.expected_completion_at > $2::timestamptz
         UNION ALL
         SELECT 'TRAINING_SESSION'::text, s.id, s.title, s.starts_at, s.ends_at
         FROM training_sessions s
         WHERE s.bay_id = $1
           AND s.status IN ('PUBLISHED', 'COMPLETED')
           AND s.starts_at < $3::timestamptz
           AND s.ends_at > $2::timestamptz
       ) entries
       ORDER BY starts_at ASC, kind ASC, reference_id ASC`,
      [bayId, query.from, query.to],
    )).rows;
  }
}

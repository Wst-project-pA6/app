import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { TrainingTermListQuery } from './dto/training-term.dto';

export interface TrainingTermRow {
  id: string;
  organization_scope_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'PLANNED' | 'ACTIVE' | 'CLOSED';
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

const TERM_SELECT = `
  t.id, t.organization_scope_id, t.name, t.start_date, t.end_date, t.status,
  t.created_at, t.updated_at, t.created_by, t.updated_by`;

const SORT_FIELDS: Record<string, string> = {
  startDate: 't.start_date',
  name: 't.name',
};

function orderBy(sort?: string): string {
  const requested = sort?.split(',') ?? ['-startDate'];
  return requested
    .map((part) => {
      const descending = part.startsWith('-');
      const field = SORT_FIELDS[descending ? part.slice(1) : part];
      if (!field) throw new Error('INVALID_SORT');
      return `${field} ${descending ? 'DESC' : 'ASC'}`;
    })
    .join(', ');
}

@Injectable()
export class TrainingTermsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findActiveScope(client: PoolClient, scopeId: string): Promise<boolean> {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM organization_scopes WHERE id = $1 AND status = 'ACTIVE' FOR SHARE`,
      [scopeId],
    );
    return result.rowCount === 1;
  }

  async findScoped(
    termId: string,
    scopeIds: string[],
    client?: PoolClient,
    lock = false,
  ): Promise<TrainingTermRow | null> {
    const sql = `SELECT ${TERM_SELECT} FROM training_terms t
      WHERE t.id = $1 AND t.organization_scope_id = ANY($2::uuid[])${lock ? ' FOR UPDATE' : ''}`;
    const result = client
      ? await client.query<TrainingTermRow>(sql, [termId, scopeIds])
      : await this.db.query<TrainingTermRow>(sql, [termId, scopeIds]);
    return result.rows[0] ?? null;
  }

  async create(
    client: PoolClient,
    data: { organizationScopeId: string; name: string; startDate: string; endDate: string; actor: string },
  ): Promise<TrainingTermRow> {
    const result = await client.query<TrainingTermRow>(
      `INSERT INTO training_terms
       (organization_scope_id, name, start_date, end_date, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, 'PLANNED', $5, $5)
       RETURNING ${TERM_SELECT.replaceAll('t.', '')}`,
      [data.organizationScopeId, data.name, data.startDate, data.endDate, data.actor],
    );
    return result.rows[0];
  }

  async update(
    client: PoolClient,
    termId: string,
    values: Record<string, unknown>,
    actor: string,
  ): Promise<TrainingTermRow | null> {
    const entries = Object.entries(values);
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
    const actorParam = entries.length + 1;
    const idParam = entries.length + 2;
    const result = await client.query<TrainingTermRow>(
      `UPDATE training_terms
       SET ${assignments}, updated_by = $${actorParam}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idParam}
       RETURNING ${TERM_SELECT.replaceAll('t.', '')}`,
      [...entries.map(([, value]) => value), actor, termId],
    );
    return result.rows[0] ?? null;
  }

  async list(query: TrainingTermListQuery, scopeIds: string[]): Promise<{ rows: TrainingTermRow[]; totalItems: number }> {
    const where = ['t.organization_scope_id = ANY($1::uuid[])'];
    const params: unknown[] = [scopeIds];
    if (query.status) {
      params.push(query.status);
      where.push(`t.status = $${params.length}`);
    }
    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM training_terms t ${condition}`,
      params,
    );
    const rows = await this.db.query<TrainingTermRow>(
      `SELECT ${TERM_SELECT} FROM training_terms t ${condition}
       ORDER BY ${orderBy(query.sort)}, t.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}

import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { CompetencyListQuery } from './dto/competency.dto';

export interface CompetencyRow {
  id: string;
  code: string;
  name_en: string;
  name_ar: string | null;
  description: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

const COMPETENCY_SELECT = `
  comp.id, comp.code, comp.name_en, comp.name_ar, comp.description, comp.status,
  comp.created_at, comp.updated_at, comp.created_by, comp.updated_by`;

const SORT_FIELDS: Record<string, string> = {
  code: 'comp.code',
  createdAt: 'comp.created_at',
};

function orderBy(sort?: string): string {
  const requested = sort?.split(',') ?? ['code'];
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
export class CompetenciesRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(competencyId: string, client?: PoolClient, lock = false): Promise<CompetencyRow | null> {
    const sql = `SELECT ${COMPETENCY_SELECT} FROM competencies comp WHERE comp.id = $1${lock ? ' FOR UPDATE OF comp' : ''}`;
    const result = client
      ? await client.query<CompetencyRow>(sql, [competencyId])
      : await this.db.query<CompetencyRow>(sql, [competencyId]);
    return result.rows[0] ?? null;
  }

  async create(
    client: PoolClient,
    data: { code: string; nameEn: string; nameAr?: string; description?: string; actor: string },
  ): Promise<CompetencyRow> {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO competencies (code, name_en, name_ar, description, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $5)
       RETURNING id`,
      [data.code, data.nameEn, data.nameAr ?? null, data.description ?? null, data.actor],
    );
    const row = await this.findById(inserted.rows[0].id, client);
    if (!row) throw new Error('Created competency could not be read');
    return row;
  }

  async update(
    client: PoolClient,
    competencyId: string,
    values: Record<string, unknown>,
    actor: string,
  ): Promise<CompetencyRow | null> {
    const entries = Object.entries(values);
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
    const actorParam = entries.length + 1;
    const idParam = entries.length + 2;
    await client.query(
      `UPDATE competencies SET ${assignments}, updated_by = $${actorParam}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idParam}`,
      [...entries.map(([, value]) => value), actor, competencyId],
    );
    return this.findById(competencyId, client);
  }

  async list(query: CompetencyListQuery): Promise<{ rows: CompetencyRow[]; totalItems: number }> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.status) {
      params.push(query.status);
      where.push(`comp.status = $${params.length}`);
    }
    const condition = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM competencies comp ${condition}`,
      params,
    );
    const rows = await this.db.query<CompetencyRow>(
      `SELECT ${COMPETENCY_SELECT} FROM competencies comp ${condition}
       ORDER BY ${orderBy(query.sort)}, comp.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}

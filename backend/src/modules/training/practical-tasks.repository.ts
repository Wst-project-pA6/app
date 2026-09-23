import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { PracticalTaskListQuery } from './dto/practical-task.dto';

export interface PracticalTaskRow {
  id: string;
  code: string;
  title_en: string;
  title_ar: string | null;
  description: string | null;
  competency_id: string;
  expected_minutes: number;
  status: 'ACTIVE' | 'ARCHIVED';
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

const TASK_SELECT = `
  p.id, p.code, p.title_en, p.title_ar, p.description, p.competency_id, p.expected_minutes,
  p.status, p.created_at, p.updated_at, p.created_by, p.updated_by`;

const SORT_FIELDS: Record<string, string> = {
  code: 'p.code',
  title: 'p.title_en',
  createdAt: 'p.created_at',
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
export class PracticalTasksRepository {
  constructor(private readonly db: DatabaseService) {}

  async findCompetency(client: PoolClient, competencyId: string): Promise<{ id: string } | null> {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM competencies WHERE id = $1 FOR SHARE`,
      [competencyId],
    );
    return result.rows[0] ?? null;
  }

  async findById(taskId: string, client?: PoolClient, lock = false): Promise<PracticalTaskRow | null> {
    const sql = `SELECT ${TASK_SELECT} FROM practical_tasks p WHERE p.id = $1${lock ? ' FOR UPDATE OF p' : ''}`;
    const result = client
      ? await client.query<PracticalTaskRow>(sql, [taskId])
      : await this.db.query<PracticalTaskRow>(sql, [taskId]);
    return result.rows[0] ?? null;
  }

  async create(
    client: PoolClient,
    data: {
      code: string;
      titleEn: string;
      titleAr?: string;
      description?: string;
      competencyId: string;
      expectedMinutes: number;
      actor: string;
    },
  ): Promise<PracticalTaskRow> {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO practical_tasks (code, title_en, title_ar, description, competency_id, expected_minutes, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, $7)
       RETURNING id`,
      [data.code, data.titleEn, data.titleAr ?? null, data.description ?? null, data.competencyId, data.expectedMinutes, data.actor],
    );
    const row = await this.findById(inserted.rows[0].id, client);
    if (!row) throw new Error('Created practical task could not be read');
    return row;
  }

  async update(
    client: PoolClient,
    taskId: string,
    values: Record<string, unknown>,
    actor: string,
  ): Promise<PracticalTaskRow | null> {
    const entries = Object.entries(values);
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
    const actorParam = entries.length + 1;
    const idParam = entries.length + 2;
    await client.query(
      `UPDATE practical_tasks SET ${assignments}, updated_by = $${actorParam}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idParam}`,
      [...entries.map(([, value]) => value), actor, taskId],
    );
    return this.findById(taskId, client);
  }

  async list(query: PracticalTaskListQuery): Promise<{ rows: PracticalTaskRow[]; totalItems: number }> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.q) {
      params.push(`%${query.q}%`);
      where.push(`(p.code ILIKE $${params.length} OR p.title_en ILIKE $${params.length})`);
    }
    if (query.competencyId) {
      params.push(query.competencyId);
      where.push(`p.competency_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`p.status = $${params.length}`);
    }
    const condition = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM practical_tasks p ${condition}`,
      params,
    );
    const rows = await this.db.query<PracticalTaskRow>(
      `SELECT ${TASK_SELECT} FROM practical_tasks p ${condition}
       ORDER BY ${orderBy(query.sort)}, p.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}

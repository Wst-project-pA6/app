import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { TrainingGroupListQuery } from './dto/training-group.dto';

export interface TrainingGroupRow {
  id: string;
  name: string;
  course_id: string;
  status: 'ACTIVE' | 'CLOSED';
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  enrolled_count: number;
}

export interface AccessibleCourseRow {
  organization_scope_id: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}

const ENROLLED_COUNT_EXPR = `(SELECT count(*)::int FROM enrollments e WHERE e.group_id = g.id AND e.status = 'ACTIVE')`;

const GROUP_SELECT = `
  g.id, g.name, g.course_id, g.status, g.created_at, g.updated_at, g.created_by, g.updated_by,
  ${ENROLLED_COUNT_EXPR} AS enrolled_count`;

const SORT_FIELDS: Record<string, string> = {
  name: 'g.name',
  createdAt: 'g.created_at',
};

function orderBy(sort?: string): string {
  const requested = sort?.split(',') ?? ['-createdAt'];
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
export class TrainingGroupsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findAccessibleCourse(
    client: PoolClient,
    courseId: string,
    scopeIds: string[],
  ): Promise<AccessibleCourseRow | null> {
    const result = await client.query<AccessibleCourseRow>(
      `SELECT organization_scope_id, status FROM courses
       WHERE id = $1 AND organization_scope_id = ANY($2::uuid[])`,
      [courseId, scopeIds],
    );
    return result.rows[0] ?? null;
  }

  async findScoped(
    groupId: string,
    scopeIds: string[],
    client?: PoolClient,
    lock = false,
  ): Promise<TrainingGroupRow | null> {
    const sql = `SELECT ${GROUP_SELECT} FROM training_groups g
      JOIN courses c ON c.id = g.course_id AND c.organization_scope_id = ANY($2::uuid[])
      WHERE g.id = $1${lock ? ' FOR UPDATE OF g' : ''}`;
    const result = client
      ? await client.query<TrainingGroupRow>(sql, [groupId, scopeIds])
      : await this.db.query<TrainingGroupRow>(sql, [groupId, scopeIds]);
    return result.rows[0] ?? null;
  }

  async create(
    client: PoolClient,
    data: { name: string; courseId: string; actor: string },
  ): Promise<TrainingGroupRow> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO training_groups (name, course_id, status, created_by, updated_by)
       VALUES ($1, $2, 'ACTIVE', $3, $3)
       RETURNING id`,
      [data.name, data.courseId, data.actor],
    );
    const row = await client.query<TrainingGroupRow>(
      `SELECT ${GROUP_SELECT} FROM training_groups g WHERE g.id = $1`,
      [result.rows[0].id],
    );
    return row.rows[0];
  }

  async update(
    client: PoolClient,
    groupId: string,
    values: Record<string, unknown>,
    actor: string,
  ): Promise<TrainingGroupRow | null> {
    const entries = Object.entries(values);
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
    const actorParam = entries.length + 1;
    const idParam = entries.length + 2;
    await client.query(
      `UPDATE training_groups SET ${assignments}, updated_by = $${actorParam}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idParam}`,
      [...entries.map(([, value]) => value), actor, groupId],
    );
    const row = await client.query<TrainingGroupRow>(
      `SELECT ${GROUP_SELECT} FROM training_groups g WHERE g.id = $1`,
      [groupId],
    );
    return row.rows[0] ?? null;
  }

  async list(query: TrainingGroupListQuery, scopeIds: string[]): Promise<{ rows: TrainingGroupRow[]; totalItems: number }> {
    const where = ['c.organization_scope_id = ANY($1::uuid[])'];
    const params: unknown[] = [scopeIds];
    if (query.courseId) {
      params.push(query.courseId);
      where.push(`g.course_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`g.status = $${params.length}`);
    }
    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM training_groups g
       JOIN courses c ON c.id = g.course_id ${condition}`,
      params,
    );
    const rows = await this.db.query<TrainingGroupRow>(
      `SELECT ${GROUP_SELECT} FROM training_groups g
       JOIN courses c ON c.id = g.course_id ${condition}
       ORDER BY ${orderBy(query.sort)}, g.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}

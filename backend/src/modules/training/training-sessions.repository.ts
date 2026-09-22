import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { TrainingSessionListQuery } from './dto/training-session.dto';

export interface TrainingSessionRow {
  id: string;
  title: string;
  course_id: string;
  group_id: string;
  bay_id: string;
  mentor_id: string;
  starts_at: Date;
  ends_at: Date;
  status: 'DRAFT' | 'PUBLISHED' | 'COMPLETED' | 'CANCELLED';
  cancellation_reason: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface AccessibleCourseRow {
  organization_scope_id: string;
}

export interface AccessibleGroupRow {
  course_id: string;
}

const SESSION_SELECT = `
  ts.id, ts.title, ts.course_id, ts.group_id, ts.bay_id, ts.mentor_id, ts.starts_at, ts.ends_at,
  ts.status, ts.cancellation_reason, ts.version, ts.created_at, ts.updated_at, ts.created_by, ts.updated_by`;

const SORT_FIELDS: Record<string, string> = {
  startsAt: 'ts.starts_at',
};

function orderBy(sort?: string): string {
  const requested = sort?.split(',') ?? ['startsAt'];
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
export class TrainingSessionsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findAccessibleCourse(
    client: PoolClient,
    courseId: string,
    scopeIds: string[],
  ): Promise<AccessibleCourseRow | null> {
    const result = await client.query<AccessibleCourseRow>(
      `SELECT organization_scope_id FROM courses WHERE id = $1 AND organization_scope_id = ANY($2::uuid[])`,
      [courseId, scopeIds],
    );
    return result.rows[0] ?? null;
  }

  async findGroup(client: PoolClient, groupId: string): Promise<AccessibleGroupRow | null> {
    const result = await client.query<AccessibleGroupRow>(
      `SELECT course_id FROM training_groups WHERE id = $1`,
      [groupId],
    );
    return result.rows[0] ?? null;
  }

  async findScoped(
    sessionId: string,
    scopeIds: string[],
    client?: PoolClient,
    lock = false,
  ): Promise<TrainingSessionRow | null> {
    const sql = `SELECT ${SESSION_SELECT} FROM training_sessions ts
      JOIN courses c ON c.id = ts.course_id AND c.organization_scope_id = ANY($2::uuid[])
      WHERE ts.id = $1${lock ? ' FOR UPDATE OF ts' : ''}`;
    const result = client
      ? await client.query<TrainingSessionRow>(sql, [sessionId, scopeIds])
      : await this.db.query<TrainingSessionRow>(sql, [sessionId, scopeIds]);
    return result.rows[0] ?? null;
  }

  async create(
    client: PoolClient,
    data: {
      title: string;
      courseId: string;
      groupId: string;
      bayId: string;
      mentorId: string;
      startsAt: string;
      endsAt: string;
      actor: string;
    },
  ): Promise<TrainingSessionRow> {
    const result = await client.query<TrainingSessionRow>(
      `INSERT INTO training_sessions
       (title, course_id, group_id, bay_id, mentor_id, starts_at, ends_at, status, version, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', 1, $8, $8)
       RETURNING ${SESSION_SELECT.replaceAll('ts.', '')}`,
      [data.title, data.courseId, data.groupId, data.bayId, data.mentorId, data.startsAt, data.endsAt, data.actor],
    );
    return result.rows[0];
  }

  async update(
    client: PoolClient,
    sessionId: string,
    expectedVersion: number,
    values: Record<string, unknown>,
    actor: string,
  ): Promise<TrainingSessionRow | null> {
    const entries = Object.entries(values);
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
    const actorParam = entries.length + 1;
    const idParam = entries.length + 2;
    const versionParam = entries.length + 3;
    const result = await client.query<TrainingSessionRow>(
      `UPDATE training_sessions
       SET ${assignments ? `${assignments}, ` : ''}version = version + 1, updated_by = $${actorParam}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idParam} AND version = $${versionParam}
       RETURNING ${SESSION_SELECT.replaceAll('ts.', '')}`,
      [...entries.map(([, value]) => value), actor, sessionId, expectedVersion],
    );
    return result.rows[0] ?? null;
  }

  async list(
    query: TrainingSessionListQuery,
    scopeIds: string[],
    restrict?: { mentorId?: string; groupIds?: string[] },
  ): Promise<{ rows: TrainingSessionRow[]; totalItems: number }> {
    const where = ['c.organization_scope_id = ANY($1::uuid[])'];
    const params: unknown[] = [scopeIds];
    if (query.from) {
      params.push(query.from);
      where.push(`ts.starts_at >= $${params.length}`);
    }
    if (query.to) {
      params.push(query.to);
      where.push(`ts.starts_at < $${params.length}`);
    }
    if (query.courseId) {
      params.push(query.courseId);
      where.push(`ts.course_id = $${params.length}`);
    }
    if (query.termId) {
      params.push(query.termId);
      where.push(`c.term_id = $${params.length}`);
    }
    if (query.groupId) {
      params.push(query.groupId);
      where.push(`ts.group_id = $${params.length}`);
    }
    if (query.bayId) {
      params.push(query.bayId);
      where.push(`ts.bay_id = $${params.length}`);
    }
    if (query.mentorId) {
      params.push(query.mentorId);
      where.push(`ts.mentor_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`ts.status = $${params.length}`);
    }
    if (restrict?.mentorId) {
      params.push(restrict.mentorId);
      where.push(`ts.mentor_id = $${params.length}`);
    }
    if (restrict?.groupIds !== undefined) {
      params.push(restrict.groupIds);
      where.push(`ts.group_id = ANY($${params.length}::uuid[])`);
    }
    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM training_sessions ts
       JOIN courses c ON c.id = ts.course_id ${condition}`,
      params,
    );
    const rows = await this.db.query<TrainingSessionRow>(
      `SELECT ${SESSION_SELECT} FROM training_sessions ts
       JOIN courses c ON c.id = ts.course_id ${condition}
       ORDER BY ${orderBy(query.sort)}, ts.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}

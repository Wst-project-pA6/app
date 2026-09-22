import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { CourseListQuery, CourseTaskDto } from './dto/course.dto';

export interface CourseRow {
  id: string;
  organization_scope_id: string;
  code: string;
  name_en: string;
  name_ar: string | null;
  term_id: string;
  description: string | null;
  minimum_attendance_percent: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  tasks: { taskId: string; required: boolean }[];
}

export interface CourseTaskRow {
  task_id: string;
  required: boolean;
}

function tasksExpr(idColumn: string): string {
  return `COALESCE((SELECT jsonb_agg(jsonb_build_object('taskId', ct.task_id, 'required', ct.required) ORDER BY ct.task_id)
            FROM course_tasks ct WHERE ct.course_id = ${idColumn}), '[]'::jsonb) AS tasks`;
}

const COURSE_SELECT = `
  c.id, c.organization_scope_id, c.code, c.name_en, c.name_ar, c.term_id, c.description,
  c.minimum_attendance_percent, c.status, c.created_at, c.updated_at, c.created_by, c.updated_by,
  ${tasksExpr('c.id')}`;

const COURSE_RETURNING = `
  id, organization_scope_id, code, name_en, name_ar, term_id, description,
  minimum_attendance_percent, status, created_at, updated_at, created_by, updated_by,
  ${tasksExpr('id')}`;

const SORT_FIELDS: Record<string, string> = {
  code: 'c.code',
  createdAt: 'c.created_at',
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
export class CoursesRepository {
  constructor(private readonly db: DatabaseService) {}

  async findActiveScope(client: PoolClient, scopeId: string): Promise<boolean> {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM organization_scopes WHERE id = $1 AND status = 'ACTIVE' FOR SHARE`,
      [scopeId],
    );
    return result.rowCount === 1;
  }

  async findTerm(client: PoolClient, termId: string): Promise<{ organization_scope_id: string } | null> {
    const result = await client.query<{ organization_scope_id: string }>(
      `SELECT organization_scope_id FROM training_terms WHERE id = $1 FOR SHARE`,
      [termId],
    );
    return result.rows[0] ?? null;
  }

  async findExistingActiveTaskIds(client: PoolClient, taskIds: string[]): Promise<string[]> {
    if (taskIds.length === 0) return [];
    const result = await client.query<{ id: string }>(
      `SELECT id FROM practical_tasks WHERE id = ANY($1::uuid[]) AND status = 'ACTIVE'`,
      [taskIds],
    );
    return result.rows.map((row) => row.id);
  }

  async hasEnrollments(client: PoolClient, courseId: string): Promise<boolean> {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM enrollments WHERE course_id = $1 LIMIT 1`,
      [courseId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async findTasks(client: PoolClient, courseId: string): Promise<CourseTaskRow[]> {
    const result = await client.query<CourseTaskRow>(
      `SELECT task_id, required FROM course_tasks WHERE course_id = $1 ORDER BY task_id`,
      [courseId],
    );
    return result.rows;
  }

  async replaceTasks(client: PoolClient, courseId: string, tasks: CourseTaskDto[]): Promise<void> {
    await client.query(`DELETE FROM course_tasks WHERE course_id = $1`, [courseId]);
    if (tasks.length === 0) return;
    await client.query(
      `INSERT INTO course_tasks (course_id, task_id, required)
       SELECT $1, task_id, required FROM unnest($2::uuid[], $3::boolean[]) AS t(task_id, required)`,
      [courseId, tasks.map((t) => t.taskId), tasks.map((t) => t.required)],
    );
  }

  async findScoped(
    courseId: string,
    scopeIds: string[],
    client?: PoolClient,
    lock = false,
  ): Promise<CourseRow | null> {
    const sql = `SELECT ${COURSE_SELECT} FROM courses c
      WHERE c.id = $1 AND c.organization_scope_id = ANY($2::uuid[])${lock ? ' FOR UPDATE OF c' : ''}`;
    const result = client
      ? await client.query<CourseRow>(sql, [courseId, scopeIds])
      : await this.db.query<CourseRow>(sql, [courseId, scopeIds]);
    return result.rows[0] ?? null;
  }

  async create(
    client: PoolClient,
    data: {
      organizationScopeId: string;
      code: string;
      nameEn: string;
      nameAr?: string;
      termId: string;
      description?: string;
      minimumAttendancePercent: number;
      actor: string;
    },
  ): Promise<CourseRow> {
    const result = await client.query<CourseRow>(
      `INSERT INTO courses
       (organization_scope_id, code, name_en, name_ar, term_id, description, minimum_attendance_percent, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', $8, $8)
       RETURNING ${COURSE_RETURNING}`,
      [
        data.organizationScopeId,
        data.code,
        data.nameEn,
        data.nameAr ?? null,
        data.termId,
        data.description ?? null,
        data.minimumAttendancePercent,
        data.actor,
      ],
    );
    return result.rows[0];
  }

  async update(
    client: PoolClient,
    courseId: string,
    values: Record<string, unknown>,
    actor: string,
  ): Promise<CourseRow | null> {
    const entries = Object.entries(values);
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
    const actorParam = entries.length + 1;
    const idParam = entries.length + 2;
    const result = await client.query<CourseRow>(
      `UPDATE courses
       SET ${assignments ? `${assignments}, ` : ''}updated_by = $${actorParam}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idParam}
       RETURNING ${COURSE_RETURNING}`,
      [...entries.map(([, value]) => value), actor, courseId],
    );
    return result.rows[0] ?? null;
  }

  async list(
    query: CourseListQuery,
    scopeIds: string[],
    enrolledCourseIds?: string[],
  ): Promise<{ rows: CourseRow[]; totalItems: number }> {
    const where = ['c.organization_scope_id = ANY($1::uuid[])'];
    const params: unknown[] = [scopeIds];
    if (query.termId) {
      params.push(query.termId);
      where.push(`c.term_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`c.status = $${params.length}`);
    }
    if (query.q) {
      params.push(`%${query.q}%`);
      where.push(`(c.code ILIKE $${params.length} OR c.name_en ILIKE $${params.length})`);
    }
    if (enrolledCourseIds !== undefined) {
      params.push(enrolledCourseIds);
      where.push(`c.id = ANY($${params.length}::uuid[])`);
    }
    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM courses c ${condition}`,
      params,
    );
    const rows = await this.db.query<CourseRow>(
      `SELECT ${COURSE_SELECT} FROM courses c ${condition}
       ORDER BY ${orderBy(query.sort)}, c.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}

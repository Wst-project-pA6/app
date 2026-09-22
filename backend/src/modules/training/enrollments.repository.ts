import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { EnrollmentListQuery } from './dto/enrollment.dto';

export interface EnrollmentRow {
  id: string;
  group_id: string;
  course_id: string;
  student_id: string;
  status: 'ACTIVE' | 'WITHDRAWN' | 'COMPLETED';
  enrolled_at: Date;
  withdrawn_at: Date | null;
  withdrawal_reason: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

const ENROLLMENT_SELECT = `
  e.id, e.group_id, e.course_id, e.student_id, e.status, e.enrolled_at, e.withdrawn_at, e.withdrawal_reason,
  e.created_at, e.updated_at, e.created_by, e.updated_by`;

const SORT_FIELDS: Record<string, string> = {
  enrolledAt: 'e.enrolled_at',
};

function orderBy(sort?: string): string {
  const requested = sort?.split(',') ?? ['-enrolledAt'];
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
export class EnrollmentsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findEnrolledCourseIds(studentId: string): Promise<string[]> {
    const result = await this.db.query<{ course_id: string }>(
      `SELECT DISTINCT course_id FROM enrollments WHERE student_id = $1 AND status <> 'WITHDRAWN'`,
      [studentId],
    );
    return result.rows.map((row) => row.course_id);
  }

  async findEnrolledGroupIds(studentId: string): Promise<string[]> {
    const result = await this.db.query<{ group_id: string }>(
      `SELECT DISTINCT group_id FROM enrollments WHERE student_id = $1 AND status <> 'WITHDRAWN'`,
      [studentId],
    );
    return result.rows.map((row) => row.group_id);
  }

  async findScoped(
    enrollmentId: string,
    scopeIds: string[],
    client?: PoolClient,
    lock = false,
  ): Promise<EnrollmentRow | null> {
    const sql = `SELECT ${ENROLLMENT_SELECT} FROM enrollments e
      JOIN courses c ON c.id = e.course_id AND c.organization_scope_id = ANY($2::uuid[])
      WHERE e.id = $1${lock ? ' FOR UPDATE OF e' : ''}`;
    const result = client
      ? await client.query<EnrollmentRow>(sql, [enrollmentId, scopeIds])
      : await this.db.query<EnrollmentRow>(sql, [enrollmentId, scopeIds]);
    return result.rows[0] ?? null;
  }

  async create(
    client: PoolClient,
    data: { groupId: string; courseId: string; studentId: string; actor: string },
  ): Promise<EnrollmentRow> {
    const result = await client.query<EnrollmentRow>(
      `INSERT INTO enrollments (group_id, course_id, student_id, status, created_by, updated_by)
       VALUES ($1, $2, $3, 'ACTIVE', $4, $4)
       RETURNING ${ENROLLMENT_SELECT.replaceAll('e.', '')}`,
      [data.groupId, data.courseId, data.studentId, data.actor],
    );
    return result.rows[0];
  }

  async withdraw(
    client: PoolClient,
    enrollmentId: string,
    reason: string,
    actor: string,
  ): Promise<EnrollmentRow | null> {
    const result = await client.query<EnrollmentRow>(
      `UPDATE enrollments
       SET status = 'WITHDRAWN', withdrawn_at = CURRENT_TIMESTAMP, withdrawal_reason = $1,
           updated_by = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING ${ENROLLMENT_SELECT.replaceAll('e.', '')}`,
      [reason, actor, enrollmentId],
    );
    return result.rows[0] ?? null;
  }

  async listByGroup(
    groupId: string,
    query: EnrollmentListQuery,
  ): Promise<{ rows: EnrollmentRow[]; totalItems: number }> {
    const where = ['e.group_id = $1'];
    const params: unknown[] = [groupId];
    if (query.status) {
      params.push(query.status);
      where.push(`e.status = $${params.length}`);
    }
    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM enrollments e ${condition}`,
      params,
    );
    const rows = await this.db.query<EnrollmentRow>(
      `SELECT ${ENROLLMENT_SELECT} FROM enrollments e ${condition}
       ORDER BY ${orderBy(query.sort)}, e.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}

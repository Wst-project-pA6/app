import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { StudentListQuery } from './dto/student.dto';

export interface StudentRow {
  id: string;
  user_id: string;
  student_number: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  display_name: string;
}

const STUDENT_SELECT = `
  s.id, s.user_id, s.student_number, s.status, s.created_at, s.updated_at, s.created_by, s.updated_by,
  u.display_name`;

const SORT_FIELDS: Record<string, string> = {
  studentNumber: 's.student_number',
  displayName: 'u.display_name',
};

function orderBy(sort?: string): string {
  const requested = sort?.split(',') ?? ['studentNumber'];
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
export class StudentsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findEligibleUser(client: PoolClient, userId: string): Promise<{ id: string } | null> {
    const result = await client.query<{ id: string }>(
      `SELECT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role_code = 'STUDENT'
       WHERE u.id = $1 AND u.status = 'ACTIVE'`,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async findById(studentId: string, client?: PoolClient, lock = false): Promise<StudentRow | null> {
    const sql = `SELECT ${STUDENT_SELECT} FROM students s
      JOIN users u ON u.id = s.user_id
      WHERE s.id = $1${lock ? ' FOR UPDATE OF s' : ''}`;
    const result = client
      ? await client.query<StudentRow>(sql, [studentId])
      : await this.db.query<StudentRow>(sql, [studentId]);
    return result.rows[0] ?? null;
  }

  async create(
    client: PoolClient,
    data: { userId: string; studentNumber: string; actor: string },
  ): Promise<StudentRow> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO students (user_id, student_number, status, created_by, updated_by)
       VALUES ($1, $2, 'ACTIVE', $3, $3)
       RETURNING id`,
      [data.userId, data.studentNumber, data.actor],
    );
    return (await this.findById(result.rows[0].id, client))!;
  }

  async update(
    client: PoolClient,
    studentId: string,
    values: Record<string, unknown>,
    actor: string,
  ): Promise<StudentRow | null> {
    const entries = Object.entries(values);
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
    const actorParam = entries.length + 1;
    const idParam = entries.length + 2;
    await client.query(
      `UPDATE students SET ${assignments}, updated_by = $${actorParam}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idParam}`,
      [...entries.map(([, value]) => value), actor, studentId],
    );
    return this.findById(studentId, client);
  }

  async list(
    query: StudentListQuery,
    options: { mentorUserId?: string } = {},
  ): Promise<{ rows: StudentRow[]; totalItems: number }> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (query.status) {
      params.push(query.status);
      where.push(`s.status = $${params.length}`);
    }
    if (query.q) {
      params.push(`%${query.q}%`);
      where.push(`(s.student_number ILIKE $${params.length} OR u.display_name ILIKE $${params.length})`);
    }
    if (query.groupId) {
      params.push(query.groupId);
      where.push(`EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = s.id AND e.group_id = $${params.length})`);
    }
    if (query.courseId) {
      params.push(query.courseId);
      where.push(`EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = s.id AND e.course_id = $${params.length})`);
    }
    if (options.mentorUserId) {
      params.push(options.mentorUserId);
      where.push(`EXISTS (
        SELECT 1 FROM enrollments e
        JOIN training_sessions ts ON ts.group_id = e.group_id
        WHERE e.student_id = s.id AND ts.mentor_id = $${params.length}
      )`);
    }
    const condition = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM students s JOIN users u ON u.id = s.user_id ${condition}`,
      params,
    );
    const rows = await this.db.query<StudentRow>(
      `SELECT ${STUDENT_SELECT} FROM students s JOIN users u ON u.id = s.user_id ${condition}
       ORDER BY ${orderBy(query.sort)}, s.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}

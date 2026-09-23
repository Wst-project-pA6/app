import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { AttendanceListQuery } from './dto/attendance.dto';

export interface AttendanceRow {
  id: string;
  session_id: string;
  student_id: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  note: string | null;
  recorded_by: string;
  recorded_at: Date;
  created_at: Date;
  updated_at: Date;
}

const ATTENDANCE_SELECT = `
  ar.id, ar.session_id, ar.student_id, ar.status, ar.note, ar.recorded_by, ar.recorded_at,
  ar.created_at, ar.updated_at`;

const SORT_FIELDS: Record<string, string> = {
  recordedAt: 'ar.recorded_at',
  createdAt: 'ar.created_at',
};

function orderBy(sort?: string): string {
  const requested = sort?.split(',') ?? ['-recordedAt'];
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
export class AttendanceRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Of the given students, those holding an ACTIVE enrollment in this session's group. */
  async findActiveEnrolledStudentIds(client: PoolClient, groupId: string, studentIds: string[]): Promise<Set<string>> {
    if (studentIds.length === 0) return new Set();
    const result = await client.query<{ student_id: string }>(
      `SELECT student_id FROM enrollments
       WHERE group_id = $1 AND student_id = ANY($2::uuid[]) AND status = 'ACTIVE'`,
      [groupId, studentIds],
    );
    return new Set(result.rows.map((row) => row.student_id));
  }

  /**
   * Pre-mutation snapshot (locked) used to build the audited before/after diff. Ordered by
   * student_id so lock acquisition follows the same deterministic sequence as upsertBulk's
   * sort — without it, Postgres gives no guarantee that FOR UPDATE acquires row locks in the
   * ANY($2) array's order, so two overlapping concurrent PUTs on the same session could lock
   * in inconsistent relative order and deadlock.
   */
  async findExisting(client: PoolClient, sessionId: string, studentIds: string[]): Promise<AttendanceRow[]> {
    if (studentIds.length === 0) return [];
    const result = await client.query<AttendanceRow>(
      `SELECT ${ATTENDANCE_SELECT} FROM attendance_records ar
       WHERE ar.session_id = $1 AND ar.student_id = ANY($2::uuid[])
       ORDER BY ar.student_id
       FOR UPDATE OF ar`,
      [sessionId, studentIds],
    );
    return result.rows;
  }

  /** Bulk upsert; rows are processed in studentId order for a deterministic lock sequence. */
  async upsertBulk(
    client: PoolClient,
    sessionId: string,
    records: { studentId: string; status: string; note: string | null }[],
    actor: string,
  ): Promise<AttendanceRow[]> {
    const sorted = [...records].sort((a, b) => a.studentId.localeCompare(b.studentId));
    const result = await client.query<AttendanceRow>(
      `INSERT INTO attendance_records (session_id, student_id, status, note, recorded_by)
       SELECT $1, student_id, status, note, $5
       FROM unnest($2::uuid[], $3::text[], $4::text[]) AS t(student_id, status, note)
       ON CONFLICT (session_id, student_id) DO UPDATE
         SET status = EXCLUDED.status, note = EXCLUDED.note, recorded_by = EXCLUDED.recorded_by,
             recorded_at = CURRENT_TIMESTAMP
       RETURNING ${ATTENDANCE_SELECT.replaceAll('ar.', '')}`,
      [
        sessionId,
        sorted.map((record) => record.studentId),
        sorted.map((record) => record.status),
        sorted.map((record) => record.note),
        actor,
      ],
    );
    return result.rows;
  }

  async list(
    query: AttendanceListQuery,
    scopeIds: string[],
    restrict?: { mentorId?: string; studentId?: string },
  ): Promise<{ rows: AttendanceRow[]; totalItems: number }> {
    const where = ['c.organization_scope_id = ANY($1::uuid[])'];
    const params: unknown[] = [scopeIds];
    if (query.sessionId) {
      params.push(query.sessionId);
      where.push(`ar.session_id = $${params.length}`);
    }
    if (query.studentId) {
      params.push(query.studentId);
      where.push(`ar.student_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`ar.status = $${params.length}`);
    }
    if (query.from) {
      params.push(query.from);
      where.push(`ar.recorded_at >= $${params.length}`);
    }
    if (query.to) {
      params.push(query.to);
      where.push(`ar.recorded_at < $${params.length}`);
    }
    if (restrict?.mentorId) {
      params.push(restrict.mentorId);
      where.push(`ts.mentor_id = $${params.length}`);
    }
    if (restrict?.studentId) {
      params.push(restrict.studentId);
      where.push(`ar.student_id = $${params.length}`);
    }
    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM attendance_records ar
       JOIN training_sessions ts ON ts.id = ar.session_id
       JOIN courses c ON c.id = ts.course_id ${condition}`,
      params,
    );
    const rows = await this.db.query<AttendanceRow>(
      `SELECT ${ATTENDANCE_SELECT} FROM attendance_records ar
       JOIN training_sessions ts ON ts.id = ar.session_id
       JOIN courses c ON c.id = ts.course_id ${condition}
       ORDER BY ${orderBy(query.sort)}, ar.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}

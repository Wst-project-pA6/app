import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { AssessmentListQuery } from './dto/assessment.dto';

export interface AssessmentRow {
  id: string;
  session_id: string;
  student_id: string;
  task_id: string;
  course_id: string;
  result: 'PASS' | 'FAIL' | 'NEEDS_IMPROVEMENT';
  time_on_task_minutes: number;
  mentor_note: string | null;
  assessed_by: string;
  assessed_at: Date;
  sign_off_status: 'PENDING' | 'SIGNED_OFF' | 'RETURNED';
  signed_off_by: string | null;
  signed_off_at: Date | null;
  sign_off_note: string | null;
  counts_toward_completion: boolean;
  version: number;
  created_at: Date;
  updated_at: Date;
  evidence_attachment_ids: string[];
}

export interface AssessmentWithSessionRow extends AssessmentRow {
  session_mentor_id: string;
}

const ASSESSMENT_SELECT = `
  a.id, a.session_id, a.student_id, a.task_id, a.course_id, a.result, a.time_on_task_minutes,
  a.mentor_note, a.assessed_by, a.assessed_at, a.sign_off_status, a.signed_off_by, a.signed_off_at,
  a.sign_off_note, a.counts_toward_completion, a.version, a.created_at, a.updated_at,
  COALESCE((SELECT array_agg(attachment_id ORDER BY attachment_id) FROM assessment_evidence_attachments WHERE assessment_id = a.id),
           ARRAY[]::uuid[]) AS evidence_attachment_ids`;

const SORT_FIELDS: Record<string, string> = {
  assessedAt: 'a.assessed_at',
  createdAt: 'a.created_at',
};

function orderBy(sort?: string): string {
  const requested = sort?.split(',') ?? ['-assessedAt'];
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
export class AssessmentsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findScoped(
    assessmentId: string,
    scopeIds: string[],
    client?: PoolClient,
    lock = false,
  ): Promise<AssessmentWithSessionRow | null> {
    const sql = `SELECT ${ASSESSMENT_SELECT}, ts.mentor_id AS session_mentor_id
      FROM assessments a
      JOIN training_sessions ts ON ts.id = a.session_id
      JOIN courses c ON c.id = a.course_id AND c.organization_scope_id = ANY($2::uuid[])
      WHERE a.id = $1${lock ? ' FOR UPDATE OF a' : ''}`;
    const result = client
      ? await client.query<AssessmentWithSessionRow>(sql, [assessmentId, scopeIds])
      : await this.db.query<AssessmentWithSessionRow>(sql, [assessmentId, scopeIds]);
    return result.rows[0] ?? null;
  }

  async findById(client: PoolClient, assessmentId: string): Promise<AssessmentRow | null> {
    const result = await client.query<AssessmentRow>(
      `SELECT ${ASSESSMENT_SELECT} FROM assessments a WHERE a.id = $1`,
      [assessmentId],
    );
    return result.rows[0] ?? null;
  }

  async isStudentActivelyEnrolled(client: PoolClient, groupId: string, studentId: string): Promise<boolean> {
    const result = await client.query(
      `SELECT 1 FROM enrollments WHERE group_id = $1 AND student_id = $2 AND status = 'ACTIVE'`,
      [groupId, studentId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async isTaskInCourse(client: PoolClient, courseId: string, taskId: string): Promise<boolean> {
    const result = await client.query(
      `SELECT 1 FROM course_tasks WHERE course_id = $1 AND task_id = $2`,
      [courseId, taskId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async create(
    client: PoolClient,
    data: {
      sessionId: string;
      studentId: string;
      taskId: string;
      courseId: string;
      result: string;
      timeOnTaskMinutes: number;
      mentorNote?: string;
      actor: string;
    },
  ): Promise<AssessmentRow> {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO assessments
       (session_id, student_id, task_id, course_id, result, time_on_task_minutes, mentor_note, assessed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        data.sessionId, data.studentId, data.taskId, data.courseId, data.result,
        data.timeOnTaskMinutes, data.mentorNote ?? null, data.actor,
      ],
    );
    const row = await this.findById(client, inserted.rows[0].id);
    if (!row) throw new Error('Created assessment could not be read');
    return row;
  }

  async update(
    client: PoolClient,
    assessmentId: string,
    expectedVersion: number,
    values: Record<string, unknown>,
  ): Promise<AssessmentRow | null> {
    const entries = Object.entries(values);
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
    const idParam = entries.length + 1;
    const versionParam = entries.length + 2;
    const result = await client.query<{ id: string }>(
      `UPDATE assessments
       SET ${assignments ? `${assignments}, ` : ''}version = version + 1
       WHERE id = $${idParam} AND version = $${versionParam}
       RETURNING id`,
      [...entries.map(([, value]) => value), assessmentId, expectedVersion],
    );
    if (result.rowCount !== 1) return null;
    return this.findById(client, assessmentId);
  }

  /**
   * Records the supervisor's decision. The WHERE guard against an already-SIGNED_OFF row is
   * belt-and-suspenders next to the app-level check and the frozen chk_sign_off_by_distinct_from_assessor
   * / forbid_edit_signed_off_assessment database defenses (see AssessmentsService.signOff).
   */
  async signOff(
    client: PoolClient,
    assessmentId: string,
    data: { status: 'SIGNED_OFF' | 'RETURNED'; note: string | null; actor: string; countsTowardCompletion: boolean },
  ): Promise<AssessmentRow | null> {
    const result = await client.query<{ id: string }>(
      `UPDATE assessments
       SET sign_off_status = $1, signed_off_by = $2, signed_off_at = CURRENT_TIMESTAMP,
           sign_off_note = $3, counts_toward_completion = $4, version = version + 1
       WHERE id = $5 AND sign_off_status <> 'SIGNED_OFF'
       RETURNING id`,
      [data.status, data.actor, data.note, data.countsTowardCompletion, assessmentId],
    );
    if (result.rowCount !== 1) return null;
    return this.findById(client, assessmentId);
  }

  async linkEvidenceAttachments(client: PoolClient, assessmentId: string, attachmentIds: string[], actor: string): Promise<void> {
    if (attachmentIds.length === 0) return;
    const orderedIds = [...attachmentIds].sort();
    const result = await client.query<{ id: string }>(
      `SELECT id FROM attachments
       WHERE id = ANY($1::uuid[]) AND uploaded_by = $2 AND status = 'UNLINKED' AND purpose = 'TRAINING_EVIDENCE'
         AND created_at > now() - interval '24 hours'
       ORDER BY id
       FOR UPDATE`,
      [orderedIds, actor],
    );
    if (result.rowCount !== attachmentIds.length) throw new Error('ATTACHMENT_NOT_LINKABLE');
    await client.query(
      `UPDATE attachments SET status = 'LINKED', owner_type = 'ASSESSMENT', owner_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($2::uuid[])`,
      [assessmentId, attachmentIds],
    );
    await client.query(
      `INSERT INTO assessment_evidence_attachments (assessment_id, attachment_id)
       SELECT $1, unnest($2::uuid[])`,
      [assessmentId, attachmentIds],
    );
  }

  async list(
    query: AssessmentListQuery,
    scopeIds: string[],
    restrict?: { mentorId?: string; studentId?: string },
  ): Promise<{ rows: AssessmentRow[]; totalItems: number }> {
    const where = ['c.organization_scope_id = ANY($1::uuid[])'];
    const params: unknown[] = [scopeIds];
    if (query.sessionId) {
      params.push(query.sessionId);
      where.push(`a.session_id = $${params.length}`);
    }
    if (query.studentId) {
      params.push(query.studentId);
      where.push(`a.student_id = $${params.length}`);
    }
    if (query.taskId) {
      params.push(query.taskId);
      where.push(`a.task_id = $${params.length}`);
    }
    if (query.courseId) {
      params.push(query.courseId);
      where.push(`a.course_id = $${params.length}`);
    }
    if (query.result) {
      params.push(query.result);
      where.push(`a.result = $${params.length}`);
    }
    if (query.signOffStatus) {
      params.push(query.signOffStatus);
      where.push(`a.sign_off_status = $${params.length}`);
    }
    if (query.from) {
      params.push(query.from);
      where.push(`a.assessed_at >= $${params.length}`);
    }
    if (query.to) {
      params.push(query.to);
      where.push(`a.assessed_at < $${params.length}`);
    }
    if (restrict?.mentorId) {
      params.push(restrict.mentorId);
      where.push(`ts.mentor_id = $${params.length}`);
    }
    if (restrict?.studentId) {
      params.push(restrict.studentId);
      where.push(`a.student_id = $${params.length}`);
    }
    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM assessments a
       JOIN training_sessions ts ON ts.id = a.session_id
       JOIN courses c ON c.id = a.course_id ${condition}`,
      params,
    );
    const rows = await this.db.query<AssessmentRow>(
      `SELECT ${ASSESSMENT_SELECT} FROM assessments a
       JOIN training_sessions ts ON ts.id = a.session_id
       JOIN courses c ON c.id = a.course_id ${condition}
       ORDER BY ${orderBy(query.sort)}, a.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}

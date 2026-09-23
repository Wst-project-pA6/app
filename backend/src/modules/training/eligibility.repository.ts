import { Injectable } from '@nestjs/common';
import { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { DatabaseService } from '../../common/database/database.service';

export interface RequiredTaskStatusRow {
  task_id: string;
  task_code: string;
  competency_id: string;
  competency_code: string;
  competency_name_en: string;
  competency_name_ar: string | null;
  latest_result: 'PASS' | 'FAIL' | 'NEEDS_IMPROVEMENT' | null;
  latest_sign_off_status: 'PENDING' | 'SIGNED_OFF' | 'RETURNED' | null;
  counts_toward_completion: boolean;
}

/**
 * Read model over authoritative training data only (enrollments, attendance_records,
 * assessments, course_tasks) — never a separately-tracked eligibility flag. Every method
 * queries live; callers must recompute on every read rather than caching results.
 */
@Injectable()
export class EligibilityRepository {
  constructor(private readonly db: DatabaseService) {}

  private query<T extends QueryResultRow>(client: PoolClient | undefined, sql: string, params: unknown[]): Promise<QueryResult<T>> {
    return client ? client.query<T>(sql, params) : this.db.query<T>(sql, params);
  }

  /** The student's current ACTIVE enrollment in the course, if any (at most one, per uq_enrollments_active_per_course). */
  async findActiveEnrollment(
    studentId: string,
    courseId: string,
    client?: PoolClient,
    lock = false,
  ): Promise<{ id: string } | null> {
    const result = await this.query<{ id: string }>(
      client,
      `SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2 AND status = 'ACTIVE'${lock ? ' FOR UPDATE' : ''}`,
      [studentId, courseId],
    );
    return result.rows[0] ?? null;
  }

  async hasActiveCertificate(studentId: string, courseId: string, client?: PoolClient): Promise<boolean> {
    const result = await this.query(
      client,
      `SELECT 1 FROM certificates WHERE student_id = $1 AND course_id = $2 AND status = 'ISSUED' LIMIT 1`,
      [studentId, courseId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** (PRESENT + LATE) / recorded sessions excluding EXCUSED, 0-100, rounded in SQL (never a JS float). */
  async findAttendancePercent(studentId: string, courseId: string, client?: PoolClient): Promise<string> {
    const result = await this.query<{ pct: string }>(
      client,
      `SELECT COALESCE(ROUND(100.0 * count(*) FILTER (WHERE ar.status IN ('PRESENT', 'LATE'))
                / NULLIF(count(*) FILTER (WHERE ar.status <> 'EXCUSED'), 0), 2), 0)::text AS pct
       FROM attendance_records ar
       JOIN training_sessions ts ON ts.id = ar.session_id
       WHERE ar.student_id = $1 AND ts.course_id = $2`,
      [studentId, courseId],
    );
    return result.rows[0]?.pct ?? '0';
  }

  /**
   * Every task required by the course, joined to its competency and to the student's LATEST
   * assessment for that task (by assessed_at, then id, descending) — "latest" because a retake
   * is a new row and supersedes any earlier result. Tasks never attempted come back with null
   * latest_result/latest_sign_off_status and counts_toward_completion = false. This single shape
   * feeds both CompetencyCoverage (grouped by competency) and CompletionEligibility (per task).
   */
  async findRequiredTaskStatuses(studentId: string, courseId: string, client?: PoolClient): Promise<RequiredTaskStatusRow[]> {
    const result = await this.query<RequiredTaskStatusRow>(
      client,
      `WITH required AS (
         SELECT ct.task_id, pt.code AS task_code, pt.competency_id,
                comp.code AS competency_code, comp.name_en AS competency_name_en, comp.name_ar AS competency_name_ar
         FROM course_tasks ct
         JOIN practical_tasks pt ON pt.id = ct.task_id
         JOIN competencies comp ON comp.id = pt.competency_id
         WHERE ct.course_id = $2 AND ct.required = TRUE
       ),
       latest AS (
         SELECT DISTINCT ON (a.task_id) a.task_id, a.result, a.sign_off_status, a.counts_toward_completion
         FROM assessments a
         WHERE a.student_id = $1 AND a.course_id = $2 AND a.task_id IN (SELECT task_id FROM required)
         ORDER BY a.task_id, a.assessed_at DESC, a.id DESC
       )
       SELECT r.task_id, r.task_code, r.competency_id, r.competency_code, r.competency_name_en, r.competency_name_ar,
              l.result AS latest_result, l.sign_off_status AS latest_sign_off_status,
              COALESCE(l.counts_toward_completion, FALSE) AS counts_toward_completion
       FROM required r
       LEFT JOIN latest l ON l.task_id = r.task_id
       ORDER BY r.competency_code, r.task_code, r.task_id`,
      [studentId, courseId],
    );
    return result.rows;
  }

  /** Rounds an already-exact integer ratio in SQL (NUMERIC), never via JS floating point. */
  async computePercent(numerator: number, denominator: number, client?: PoolClient): Promise<string> {
    const result = await this.query<{ pct: string }>(
      client,
      `SELECT COALESCE(ROUND(100.0 * $1::numeric / NULLIF($2, 0), 2), 0)::text AS pct`,
      [numerator, denominator],
    );
    return result.rows[0]?.pct ?? '0';
  }
}

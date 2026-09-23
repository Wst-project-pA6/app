import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

export interface RiskCandidateRow {
  student_id: string;
  course_id: string;
  total_sessions: number;
  attended_sessions: number;
  unsigned_assessment_count: number;
  unmet_competency_count: number;
}

const CANDIDATE_LIMIT = 200;

/**
 * Read-only input gathering for the training-risk rule baseline (WST-FR-14). Like
 * ReorderBaselineRepository, this has no write methods at all — see the
 * "no-operational-mutation" test in prediction-runs.service.spec.ts.
 */
@Injectable()
export class TrainingRiskBaselineRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * One candidate per ACTIVE enrollment in scope. When `mentorUserId` is given (a MENTOR
   * triggering the run), candidates are further restricted to students that mentor actually
   * teaches — same join pattern as StudentsRepository.list's mentorUserId option.
   */
  async findCandidates(scopeIds: string[], courseId: string | undefined, mentorUserId: string | undefined): Promise<RiskCandidateRow[]> {
    const params: unknown[] = [scopeIds];
    let courseCondition = '';
    if (courseId) { params.push(courseId); courseCondition = `AND e.course_id = $${params.length}`; }
    let mentorCondition = '';
    if (mentorUserId) {
      params.push(mentorUserId);
      mentorCondition = `AND EXISTS (
        SELECT 1 FROM training_sessions ts2 WHERE ts2.group_id = e.group_id AND ts2.mentor_id = $${params.length}
      )`;
    }

    const result = await this.db.query<RiskCandidateRow>(
      `SELECT e.student_id, e.course_id,
              COALESCE(sessions.total, 0)::int AS total_sessions,
              COALESCE(sessions.attended, 0)::int AS attended_sessions,
              COALESCE(unsigned.cnt, 0)::int AS unsigned_assessment_count,
              COALESCE(unmet.cnt, 0)::int AS unmet_competency_count
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS total,
                count(*) FILTER (WHERE ar.status IN ('PRESENT', 'LATE', 'EXCUSED'))::int AS attended
         FROM training_sessions ts
         LEFT JOIN attendance_records ar ON ar.session_id = ts.id AND ar.student_id = e.student_id
         WHERE ts.group_id = e.group_id AND ts.status IN ('PUBLISHED', 'COMPLETED')
       ) sessions ON TRUE
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS cnt
         FROM assessments a
         WHERE a.student_id = e.student_id AND a.course_id = e.course_id AND a.sign_off_status <> 'SIGNED_OFF'
       ) unsigned ON TRUE
       LEFT JOIN LATERAL (
         SELECT count(*)::int AS cnt
         FROM course_tasks ct
         WHERE ct.course_id = e.course_id AND ct.required = TRUE
           AND NOT EXISTS (
             SELECT 1 FROM assessments a
             WHERE a.student_id = e.student_id AND a.task_id = ct.task_id AND a.counts_toward_completion = TRUE
           )
       ) unmet ON TRUE
       WHERE e.status = 'ACTIVE' AND c.organization_scope_id = ANY($1::uuid[])
         ${courseCondition}
         ${mentorCondition}
       ORDER BY e.student_id, e.course_id
       LIMIT ${CANDIDATE_LIMIT}`,
      params,
    );
    return result.rows;
  }
}

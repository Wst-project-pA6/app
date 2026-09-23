import { HttpStatus, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { ScopeService } from '../../common/auth/scope.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CoursesRepository, CourseRow } from './courses.repository';
import { StudentsRepository } from './students.repository';
import { EligibilityRepository, RequiredTaskStatusRow } from './eligibility.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

export interface UnmetCondition {
  code: 'ENROLLMENT_NOT_ACTIVE' | 'ATTENDANCE_BELOW_MINIMUM' | 'REQUIRED_TASK_NOT_PASSED' | 'ASSESSMENT_UNSIGNED' | 'CERTIFICATE_ALREADY_ISSUED';
  message: string;
  taskId?: string;
}

export interface EligibilityEvaluation {
  attendancePercent: string;
  eligible: boolean;
  unmetConditions: UnmetCondition[];
}

/**
 * Derives competency coverage and completion eligibility ONLY from authoritative training data
 * (enrollments, attendance_records, SIGNED_OFF+PASS assessments via counts_toward_completion,
 * course_tasks) — there is no separately-tracked eligibility flag anywhere, so every call
 * recomputes live. `evaluate()` is the single source of truth shared by the read-only
 * completion-eligibility endpoint AND certificate issuance (which calls it again inside a
 * transaction, after locking the enrollment row, to re-verify before writing).
 */
@Injectable()
export class EligibilityService {
  constructor(
    private readonly coursesRepository: CoursesRepository,
    private readonly studentsRepository: StudentsRepository,
    private readonly repository: EligibilityRepository,
    private readonly scopeService: ScopeService,
  ) {}

  async getCoverage(studentId: string, courseId: string, actor: AuthenticatedPrincipal) {
    this.assertReadAccess(actor, studentId);
    const scopes = this.scopeService.allowedScopeIds(actor);
    await this.findStudentAndCourse(studentId, courseId, scopes);

    const rows = await this.repository.findRequiredTaskStatuses(studentId, courseId);
    const byCompetency = new Map<string, { code: string; nameEn: string; nameAr: string | null; rows: RequiredTaskStatusRow[] }>();
    for (const row of rows) {
      const bucket = byCompetency.get(row.competency_id)
        ?? { code: row.competency_code, nameEn: row.competency_name_en, nameAr: row.competency_name_ar, rows: [] as RequiredTaskStatusRow[] };
      bucket.rows.push(row);
      byCompetency.set(row.competency_id, bucket);
    }

    const competencies = [];
    for (const [competencyId, bucket] of byCompetency) {
      const requiredTasks = bucket.rows.length;
      const signedPassedRequiredTasks = bucket.rows.filter((row) => row.counts_toward_completion).length;
      const pendingUnsignedTasks = bucket.rows.filter((row) => row.latest_sign_off_status === 'PENDING' || row.latest_sign_off_status === 'RETURNED').length;
      const coveragePercent = await this.repository.computePercent(signedPassedRequiredTasks, requiredTasks);
      competencies.push({
        competencyId,
        code: bucket.code,
        name: { en: bucket.nameEn, ...(bucket.nameAr ? { ar: bucket.nameAr } : {}) },
        requiredTasks,
        signedPassedRequiredTasks,
        pendingUnsignedTasks,
        coveragePercent,
      });
    }
    competencies.sort((a, b) => a.code.localeCompare(b.code));

    const totalRequired = rows.length;
    const totalSignedPassed = rows.filter((row) => row.counts_toward_completion).length;
    const overallPercent = await this.repository.computePercent(totalSignedPassed, totalRequired);

    return { studentId, courseId, overallPercent, competencies, generatedAt: new Date() };
  }

  async getEligibility(studentId: string, courseId: string, actor: AuthenticatedPrincipal) {
    this.assertReadAccess(actor, studentId);
    const scopes = this.scopeService.allowedScopeIds(actor);
    const { course } = await this.findStudentAndCourse(studentId, courseId, scopes);
    const evaluation = await this.evaluate(studentId, courseId, course.minimum_attendance_percent);
    return {
      studentId,
      courseId,
      eligible: evaluation.eligible,
      attendancePercent: evaluation.attendancePercent,
      minimumAttendancePercent: course.minimum_attendance_percent,
      unmetConditions: evaluation.unmetConditions,
      evaluatedAt: new Date(),
    };
  }

  /** Locks the student's ACTIVE enrollment for this course; the serialization point for issuance. */
  async lockActiveEnrollment(client: PoolClient, studentId: string, courseId: string): Promise<{ id: string } | null> {
    return this.repository.findActiveEnrollment(studentId, courseId, client, true);
  }

  async evaluate(studentId: string, courseId: string, minimumAttendancePercent: number, client?: PoolClient): Promise<EligibilityEvaluation> {
    const unmetConditions: UnmetCondition[] = [];

    const enrollment = await this.repository.findActiveEnrollment(studentId, courseId, client);
    if (!enrollment) {
      unmetConditions.push({ code: 'ENROLLMENT_NOT_ACTIVE', message: 'Student does not have an ACTIVE enrollment in this course' });
    }

    const attendancePercent = await this.repository.findAttendancePercent(studentId, courseId, client);
    if (Number(attendancePercent) < minimumAttendancePercent) {
      unmetConditions.push({
        code: 'ATTENDANCE_BELOW_MINIMUM',
        message: `Attendance ${attendancePercent}% is below the required minimum of ${minimumAttendancePercent}%`,
      });
    }

    const taskRows = await this.repository.findRequiredTaskStatuses(studentId, courseId, client);
    for (const row of taskRows) {
      if (row.counts_toward_completion) continue;
      if (row.latest_result === 'PASS') {
        unmetConditions.push({
          code: 'ASSESSMENT_UNSIGNED',
          taskId: row.task_id,
          message: `Task ${row.task_code} was passed but is not yet signed off`,
        });
      } else {
        unmetConditions.push({
          code: 'REQUIRED_TASK_NOT_PASSED',
          taskId: row.task_id,
          message: `Task ${row.task_code} has not been passed`,
        });
      }
    }

    if (await this.repository.hasActiveCertificate(studentId, courseId, client)) {
      unmetConditions.push({ code: 'CERTIFICATE_ALREADY_ISSUED', message: 'A certificate has already been issued for this enrollment' });
    }

    return { attendancePercent, eligible: unmetConditions.length === 0, unmetConditions };
  }

  private assertReadAccess(actor: AuthenticatedPrincipal, studentId: string): void {
    if (!actor.permissions.includes('training.read') && actor.studentId !== studentId) {
      throw notFound();
    }
  }

  private async findStudentAndCourse(studentId: string, courseId: string, scopes: string[]): Promise<{ course: CourseRow }> {
    const student = await this.studentsRepository.findById(studentId);
    if (!student) throw notFound();
    const course = await this.coursesRepository.findScoped(courseId, scopes);
    if (!course) throw notFound();
    return { course };
  }
}

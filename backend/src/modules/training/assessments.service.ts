import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { PracticalTasksRepository } from './practical-tasks.repository';
import { TrainingSessionsRepository } from './training-sessions.repository';
import {
  AssessmentCreateDto,
  AssessmentListQuery,
  AssessmentUpdateDto,
  SignOffDecision,
  SignOffRequestDto,
} from './dto/assessment.dto';
import { AssessmentRow, AssessmentsRepository } from './assessments.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const versionConflict = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.VERSION_CONFLICT, 'Version conflict');

const assessmentLocked = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.ASSESSMENT_LOCKED, 'Assessment is signed off and immutable');

const separationOfDuties = (message: string): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.SEPARATION_OF_DUTIES_VIOLATION, message);

const attachmentNotLinkable = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.ATTACHMENT_NOT_LINKABLE, 'Attachment cannot be linked');

const validationFailed = (field: string, code: string, message: string): AppError =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED, 'Validation failed', [
    { field, code, message },
  ]);

/**
 * Defense-in-depth: maps the frozen database guards to the same API errors the application-level
 * checks already raise, in case any code path ever reaches the database without going through
 * them (see AssessmentsService.signOff and .update for the primary, pre-write checks).
 */
function mapConstraintError(error: unknown): never {
  if (error instanceof AppError) throw error;
  const dbError = error as { code?: string; constraint?: string; message?: string };
  if (dbError?.code === '23514' && dbError.constraint === 'chk_sign_off_by_distinct_from_assessor') {
    throw separationOfDuties('The assessor cannot sign off their own assessment');
  }
  if (dbError?.message?.includes('signed off and immutable')) {
    throw assessmentLocked();
  }
  throw error;
}

function mapAssessment(row: AssessmentRow) {
  return {
    id: row.id,
    sessionId: row.session_id,
    studentId: row.student_id,
    taskId: row.task_id,
    courseId: row.course_id,
    result: row.result,
    timeOnTaskMinutes: row.time_on_task_minutes,
    ...(row.mentor_note ? { mentorNote: row.mentor_note } : {}),
    evidenceAttachmentIds: row.evidence_attachment_ids,
    assessedBy: row.assessed_by,
    assessedAt: row.assessed_at,
    signOffStatus: row.sign_off_status,
    ...(row.signed_off_by ? { signedOffBy: row.signed_off_by } : {}),
    ...(row.signed_off_at ? { signedOffAt: row.signed_off_at } : {}),
    ...(row.sign_off_note ? { signOffNote: row.sign_off_note } : {}),
    countsTowardCompletion: row.counts_toward_completion,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.assessed_by,
    updatedBy: row.signed_off_by ?? row.assessed_by,
  };
}

function mapPage<T>(query: { page: number; pageSize: number }, items: T[], totalItems: number) {
  return {
    items,
    page: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}

const SORT_ALLOWED = new Set(['assessedAt', 'createdAt']);

function validateSort(sort: string | undefined): void {
  if (!sort) return;
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (!SORT_ALLOWED.has(field)) throw badRequest('Unknown sort field');
  }
}

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly repository: AssessmentsRepository,
    private readonly sessionsRepository: TrainingSessionsRepository,
    private readonly tasksRepository: PracticalTasksRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AssessmentListQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort);
    if (query.from && query.to && query.from >= query.to) throw badRequest('From must be before to');
    const scopes = this.scopeService.allowedScopeIds(actor);
    const studentOnly = !actor.permissions.includes('training.read');
    let restrict: { mentorId?: string; studentId?: string } | undefined;
    if (studentOnly) {
      if (!actor.studentId) return mapPage(query, [], 0);
      restrict = { studentId: actor.studentId };
    } else if (actor.roles.includes('MENTOR')) {
      restrict = { mentorId: actor.id };
    }
    const result = await this.repository.list(query, scopes, restrict);
    return mapPage(query, result.rows.map(mapAssessment), result.totalItems);
  }

  async create(dto: AssessmentCreateDto, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    try {
      const created = await this.transaction.runInTransaction(async (client) => {
        const session = await this.sessionsRepository.findScoped(dto.sessionId, scopes, client);
        if (!session) throw notFound();
        if (actor.roles.includes('MENTOR') && session.mentor_id !== actor.id) throw notFound();

        const task = await this.tasksRepository.findById(dto.taskId, client);
        if (!task) throw notFound();
        if (task.status !== 'ACTIVE') {
          throw validationFailed('/taskId', 'TASK_ARCHIVED', 'Cannot assess against an archived practical task');
        }
        if (!(await this.repository.isTaskInCourse(client, session.course_id, dto.taskId))) {
          throw validationFailed('/taskId', 'TASK_NOT_IN_COURSE', 'Task does not belong to the session course');
        }
        if (!(await this.repository.isStudentActivelyEnrolled(client, session.group_id, dto.studentId))) {
          throw validationFailed('/studentId', 'STUDENT_NOT_ENROLLED', "Student does not have an ACTIVE enrollment in this session's group");
        }

        const record = await this.repository.create(client, {
          sessionId: dto.sessionId,
          studentId: dto.studentId,
          taskId: dto.taskId,
          courseId: session.course_id,
          result: dto.result,
          timeOnTaskMinutes: dto.timeOnTaskMinutes,
          mentorNote: dto.mentorNote,
          actor: actor.id,
        });

        try {
          await this.repository.linkEvidenceAttachments(client, record.id, dto.evidenceAttachmentIds ?? [], actor.id);
        } catch (error) {
          if (error instanceof Error && error.message === 'ATTACHMENT_NOT_LINKABLE') throw attachmentNotLinkable();
          throw error;
        }

        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'ASSESSMENT.CREATE',
          entityType: 'ASSESSMENT',
          entityId: record.id,
          outcome: 'SUCCESS',
          summary: `Recorded ${dto.result} assessment for student ${dto.studentId} on task ${dto.taskId}`,
        });

        const withEvidence = await this.repository.findById(client, record.id);
        return withEvidence ?? record;
      });
      return mapAssessment(created);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async update(assessmentId: string, dto: AssessmentUpdateDto, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    try {
      const updated = await this.transaction.runInTransaction(async (client) => {
        const current = await this.repository.findScoped(assessmentId, scopes, client, true);
        if (!current) throw notFound();
        if (actor.roles.includes('MENTOR') && current.session_mentor_id !== actor.id) throw notFound();
        if (current.version !== dto.version) throw versionConflict();
        // Belt-and-suspenders: forbid_edit_signed_off_assessment also blocks this at the database
        // level unconditionally, but failing fast here avoids a raw trigger exception.
        if (current.sign_off_status === 'SIGNED_OFF') throw assessmentLocked();

        const values: Record<string, unknown> = {};
        if (dto.result !== undefined) values.result = dto.result;
        if (dto.timeOnTaskMinutes !== undefined) values.time_on_task_minutes = dto.timeOnTaskMinutes;
        if (dto.mentorNote !== undefined) values.mentor_note = dto.mentorNote;
        if (Object.keys(values).length === 0 && !dto.evidenceAttachmentIds?.length) {
          throw validationFailed('/', 'REQUIRED', 'At least one assessment field must change');
        }

        if (dto.evidenceAttachmentIds?.length) {
          try {
            await this.repository.linkEvidenceAttachments(client, assessmentId, dto.evidenceAttachmentIds, actor.id);
          } catch (error) {
            if (error instanceof Error && error.message === 'ATTACHMENT_NOT_LINKABLE') throw attachmentNotLinkable();
            throw error;
          }
        }

        const result = await this.repository.update(client, assessmentId, dto.version, values);
        if (!result) throw versionConflict();

        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'ASSESSMENT.UPDATE',
          entityType: 'ASSESSMENT',
          entityId: assessmentId,
          outcome: 'SUCCESS',
          summary: dto.changeReason,
          changes: [
            ...(dto.result !== undefined ? [{ field: 'result', before: current.result, after: dto.result }] : []),
            ...(dto.timeOnTaskMinutes !== undefined
              ? [{ field: 'timeOnTaskMinutes', before: current.time_on_task_minutes, after: dto.timeOnTaskMinutes }]
              : []),
            ...(dto.mentorNote !== undefined ? [{ field: 'mentorNote', before: current.mentor_note, after: dto.mentorNote }] : []),
          ],
        });
        return result;
      });
      return mapAssessment(updated);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async signOff(assessmentId: string, dto: SignOffRequestDto, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    try {
      const updated = await this.transaction.runInTransaction(async (client) => {
        const current = await this.repository.findScoped(assessmentId, scopes, client, true);
        if (!current) throw notFound();
        if (current.sign_off_status === 'SIGNED_OFF') throw assessmentLocked();

        // CRITICAL — separation of duties: the signer can never be the assessor of this exact
        // assessment. Checked here at the application layer (so the caller gets a clean 409
        // SEPARATION_OF_DUTIES_VIOLATION) AND independently re-enforced by the frozen
        // chk_sign_off_by_distinct_from_assessor CHECK constraint on the assessments table
        // (defense-in-depth — see mapConstraintError), mirroring the purchasing/inventory pattern.
        if (current.assessed_by === actor.id) {
          throw separationOfDuties('The assessor cannot sign off their own assessment');
        }
        if (dto.decision === SignOffDecision.RETURNED && !dto.note) {
          throw validationFailed('/note', 'REQUIRED', 'A note is required when returning an assessment for revision');
        }

        const countsTowardCompletion = dto.decision === SignOffDecision.SIGNED_OFF && current.result === 'PASS';
        const result = await this.repository.signOff(client, assessmentId, {
          status: dto.decision,
          note: dto.note ?? null,
          actor: actor.id,
          countsTowardCompletion,
        });
        if (!result) throw assessmentLocked();

        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'ASSESSMENT.SIGN_OFF',
          entityType: 'ASSESSMENT',
          entityId: assessmentId,
          outcome: 'SUCCESS',
          summary: `${dto.decision}${dto.note ? `: ${dto.note}` : ''}`,
          changes: [{ field: 'signOffStatus', before: current.sign_off_status, after: dto.decision }],
        });
        return result;
      });
      return mapAssessment(updated);
    } catch (error) {
      return mapConstraintError(error);
    }
  }
}

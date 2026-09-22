import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { BaysRepository } from '../bays/bays.repository';
import { EnrollmentsRepository } from './enrollments.repository';
import { MentorsRepository } from './mentors.repository';
import { CreateTrainingSessionDto, TrainingSessionListQuery, UpdateTrainingSessionDto } from './dto/training-session.dto';
import { TrainingSessionRow, TrainingSessionsRepository } from './training-sessions.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const versionConflict = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.VERSION_CONFLICT, 'Version conflict');

const validationFailed = (field: string, code: string, message: string): AppError =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED, 'Validation failed', [
    { field, code, message },
  ]);

function mapSession(row: TrainingSessionRow) {
  return {
    id: row.id,
    title: row.title,
    courseId: row.course_id,
    groupId: row.group_id,
    bayId: row.bay_id,
    mentorId: row.mentor_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    ...(row.cancellation_reason ? { cancellationReason: row.cancellation_reason } : {}),
    activeConflictOverrideCount: 0,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
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

@Injectable()
export class TrainingSessionsService {
  constructor(
    private readonly repository: TrainingSessionsRepository,
    private readonly baysRepository: BaysRepository,
    private readonly mentorsRepository: MentorsRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(query: TrainingSessionListQuery, actor: AuthenticatedPrincipal) {
    if (query.sort) {
      for (const part of query.sort.split(',')) {
        const field = part.startsWith('-') ? part.slice(1) : part;
        if (field !== 'startsAt') throw badRequest('Unknown sort field');
      }
    }
    if (query.from && query.to && query.from >= query.to) {
      throw badRequest('From must be before to');
    }
    const scopes = this.scopeService.allowedScopeIds(actor);
    const studentOnly = !actor.permissions.includes('training.read');
    let restrict: { mentorId?: string; groupIds?: string[] } | undefined;
    if (studentOnly) {
      if (!actor.studentId) return mapPage(query, [], 0);
      restrict = { groupIds: await this.enrollmentsRepository.findEnrolledGroupIds(actor.studentId) };
    } else if (actor.roles.includes('MENTOR')) {
      restrict = { mentorId: actor.id };
    }
    const result = await this.repository.list(query, scopes, restrict);
    return mapPage(query, result.rows.map(mapSession), result.totalItems);
  }

  async get(sessionId: string, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const session = await this.repository.findScoped(sessionId, scopes);
    if (!session) throw notFound();
    if (!actor.permissions.includes('training.read')) {
      if (!actor.studentId) throw notFound();
      const groupIds = await this.enrollmentsRepository.findEnrolledGroupIds(actor.studentId);
      if (!groupIds.includes(session.group_id)) throw notFound();
    }
    return mapSession(session);
  }

  async create(dto: CreateTrainingSessionDto, actor: AuthenticatedPrincipal) {
    if (dto.startsAt >= dto.endsAt) {
      throw validationFailed('/endsAt', 'WINDOW_INVALID', 'endsAt must be after startsAt');
    }
    const scopes = this.scopeService.allowedScopeIds(actor);

    const session = await this.transaction.runInTransaction(async (client) => {
      const course = await this.repository.findAccessibleCourse(client, dto.courseId, scopes);
      if (!course) throw notFound();

      const group = await this.repository.findGroup(client, dto.groupId);
      if (!group || group.course_id !== dto.courseId) throw notFound();

      const bay = await this.baysRepository.findScoped(dto.bayId, scopes, client);
      if (!bay) throw notFound();

      const mentor = await this.mentorsRepository.findEligibleMentor(client, dto.mentorId, scopes);
      if (!mentor) {
        throw validationFailed('/mentorId', 'MENTOR_NOT_ELIGIBLE', 'Mentor must hold the MENTOR role in scope');
      }

      const created = await this.repository.create(client, {
        title: dto.title,
        courseId: dto.courseId,
        groupId: dto.groupId,
        bayId: dto.bayId,
        mentorId: dto.mentorId,
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        actor: actor.id,
      });

      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'TRAINING_SESSION.CREATE',
        entityType: 'TRAINING_SESSION',
        entityId: created.id,
        outcome: 'SUCCESS',
        summary: `Created draft training session ${created.title}`,
      });
      return created;
    });
    return mapSession(session);
  }

  async update(sessionId: string, dto: UpdateTrainingSessionDto, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);

    const session = await this.transaction.runInTransaction(async (client) => {
      const current = await this.repository.findScoped(sessionId, scopes, client, true);
      if (!current) throw notFound();
      if (current.version !== dto.version) throw versionConflict();

      const nextStart = dto.startsAt ?? current.starts_at.toISOString();
      const nextEnd = dto.endsAt ?? current.ends_at.toISOString();
      if (nextStart >= nextEnd) {
        throw validationFailed('/endsAt', 'WINDOW_INVALID', 'endsAt must be after startsAt');
      }

      const targetCourseId = current.course_id;
      if (dto.groupId !== undefined) {
        const group = await this.repository.findGroup(client, dto.groupId);
        if (!group || group.course_id !== targetCourseId) throw notFound();
      }
      if (dto.bayId !== undefined) {
        const bay = await this.baysRepository.findScoped(dto.bayId, scopes, client);
        if (!bay) throw notFound();
      }
      if (dto.mentorId !== undefined) {
        const mentor = await this.mentorsRepository.findEligibleMentor(client, dto.mentorId, scopes);
        if (!mentor) {
          throw validationFailed('/mentorId', 'MENTOR_NOT_ELIGIBLE', 'Mentor must hold the MENTOR role in scope');
        }
      }

      const values: Record<string, unknown> = {};
      if (dto.title !== undefined) values.title = dto.title;
      if (dto.groupId !== undefined) values.group_id = dto.groupId;
      if (dto.bayId !== undefined) values.bay_id = dto.bayId;
      if (dto.mentorId !== undefined) values.mentor_id = dto.mentorId;
      if (dto.startsAt !== undefined) values.starts_at = dto.startsAt;
      if (dto.endsAt !== undefined) values.ends_at = dto.endsAt;

      const updated = await this.repository.update(client, sessionId, dto.version, values, actor.id);
      if (!updated) throw versionConflict();

      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'TRAINING_SESSION.UPDATE',
        entityType: 'TRAINING_SESSION',
        entityId: sessionId,
        outcome: 'SUCCESS',
        summary: `Updated training session ${sessionId}`,
      });
      return updated;
    });
    return mapSession(session);
  }
}

import { HttpStatus, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { ScheduleConflict, SchedulingConflictService } from '../../common/scheduling/scheduling-conflict.service';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { BayRow, BaysRepository } from '../bays/bays.repository';
import { EnrollmentsRepository } from './enrollments.repository';
import { MentorsRepository } from './mentors.repository';
import { TrainingGroupsRepository } from './training-groups.repository';
import {
  ConflictOverrideRequestDto,
  CreateTrainingSessionDto,
  SessionTransitionDto,
  SessionTransitionStatus,
  TrainingSessionListQuery,
  UpdateTrainingSessionDto,
} from './dto/training-session.dto';
import { TrainingSessionRow, TrainingSessionsRepository } from './training-sessions.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const versionConflict = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.VERSION_CONFLICT, 'Version conflict');

const invalidState = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.INVALID_STATE_TRANSITION, 'Invalid state transition');

const forbidden = (): AppError => new AppError(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, 'Forbidden');

const conflictNotOverridable = (key: string): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.CONFLICT_NOT_OVERRIDABLE, `Conflict ${key} is not overridable`);

const scheduleConflict = (conflicts: ScheduleConflict[]): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.SCHEDULE_CONFLICT, 'Scheduling conflict', undefined, conflicts);

const validationFailed = (field: string, code: string, message: string): AppError =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED, 'Validation failed', [
    { field, code, message },
  ]);

/** DRAFT->PUBLISHED, PUBLISHED->COMPLETED, and DRAFT/PUBLISHED->CANCELLED; nothing else, per the frozen contract. */
const ALLOWED_TRANSITIONS = new Set<string>([
  'DRAFT->PUBLISHED',
  'PUBLISHED->COMPLETED',
  'DRAFT->CANCELLED',
  'PUBLISHED->CANCELLED',
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
    activeConflictOverrideCount: row.active_conflict_override_count,
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
    private readonly trainingGroupsRepository: TrainingGroupsRepository,
    private readonly schedulingConflicts: SchedulingConflictService,
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
      let nextBay: BayRow | null = null;
      if (dto.bayId !== undefined) {
        nextBay = await this.baysRepository.findScoped(dto.bayId, scopes, client);
        if (!nextBay) throw notFound();
      }
      if (dto.mentorId !== undefined) {
        const mentor = await this.mentorsRepository.findEligibleMentor(client, dto.mentorId, scopes);
        if (!mentor) {
          throw validationFailed('/mentorId', 'MENTOR_NOT_ELIGIBLE', 'Mentor must hold the MENTOR role in scope');
        }
      }

      // Any change to bay, mentor or window voids prior overrides; a PUBLISHED session is then
      // re-validated from a clean slate (no override survives a reassignment, per contract).
      const reassigning = dto.bayId !== undefined || dto.mentorId !== undefined
        || dto.startsAt !== undefined || dto.endsAt !== undefined;
      if (reassigning) {
        await this.repository.voidActiveOverrides(client, sessionId);
      }
      if (reassigning && current.status === 'PUBLISHED') {
        const nextBayId = dto.bayId ?? current.bay_id;
        const nextMentorId = dto.mentorId ?? current.mentor_id;
        const nextGroupId = dto.groupId ?? current.group_id;
        const bay = nextBay ?? await this.baysRepository.findScoped(nextBayId, scopes, client);
        if (!bay) throw notFound();
        const group = await this.trainingGroupsRepository.findScoped(nextGroupId, scopes, client);
        if (!group) throw notFound();
        const conflicts = await this.schedulingConflicts.evaluateSessionConflicts(client, {
          sessionId,
          bayId: nextBayId,
          bayStatus: bay.status,
          bayCapacity: bay.capacity,
          requiredCapacity: group.enrolled_count,
          mentorId: nextMentorId,
          startsAt: new Date(nextStart),
          endsAt: new Date(nextEnd),
        });
        if (conflicts.length > 0) throw scheduleConflict(conflicts);
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

  async checkConflicts(sessionId: string, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    return this.transaction.runInTransaction(async (client) => {
      const session = await this.repository.findScoped(sessionId, scopes, client);
      if (!session) throw notFound();
      return this.buildConflictReport(client, session, scopes);
    });
  }

  async createOverrides(sessionId: string, dto: ConflictOverrideRequestDto, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    return this.transaction.runInTransaction(async (client) => {
      const session = await this.repository.findScoped(sessionId, scopes, client, true);
      if (!session) throw notFound();

      const report = await this.buildConflictReport(client, session, scopes);
      const overridableKeys = new Set(report.conflicts.filter((conflict) => conflict.overridable).map((conflict) => conflict.conflictKey));
      for (const key of dto.conflictKeys) {
        if (!overridableKeys.has(key)) throw conflictNotOverridable(key);
      }

      await this.repository.upsertOverrides(client, sessionId, dto.conflictKeys, dto.reason, actor.id);
      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'TRAINING_SESSION.CONFLICT_OVERRIDE',
        entityType: 'TRAINING_SESSION',
        entityId: sessionId,
        outcome: 'SUCCESS',
        summary: dto.reason,
        changes: [{ field: 'conflictKeys', before: null, after: dto.conflictKeys }],
      });

      const activeKeys = new Set(await this.repository.findActiveOverrideKeys(client, sessionId));
      const conflicts = this.schedulingConflicts.applyOverrides(report.conflicts, activeKeys);
      return {
        sessionId,
        evaluatedAt: new Date(),
        hasConflicts: conflicts.length > 0,
        canPublish: conflicts.every((conflict) => conflict.overridden),
        conflicts,
      };
    });
  }

  async transition(sessionId: string, dto: SessionTransitionDto, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const session = await this.transaction.runInTransaction(async (client) => {
      const current = await this.repository.findScoped(sessionId, scopes, client, true);
      if (!current) throw notFound();

      const key = `${current.status}->${dto.toStatus}`;
      if (!ALLOWED_TRANSITIONS.has(key)) throw invalidState();
      if (dto.toStatus === SessionTransitionStatus.PUBLISHED && !actor.permissions.includes('training.publish')) {
        throw forbidden();
      }
      if (dto.toStatus === SessionTransitionStatus.CANCELLED && !dto.reason) {
        throw validationFailed('/reason', 'REQUIRED', 'A reason is required to cancel a session');
      }

      if (dto.toStatus === SessionTransitionStatus.PUBLISHED) {
        // Deterministic lock order (self, then bay) matches job assignment, so a job and a
        // session contending for the same bay never wait on each other cyclically.
        const bay = await this.baysRepository.findScoped(current.bay_id, scopes, client, true);
        if (!bay) throw notFound();
        const group = await this.trainingGroupsRepository.findScoped(current.group_id, scopes, client);
        if (!group) throw notFound();
        const rawConflicts = await this.schedulingConflicts.evaluateSessionConflicts(client, {
          sessionId,
          bayId: current.bay_id,
          bayStatus: bay.status,
          bayCapacity: bay.capacity,
          requiredCapacity: group.enrolled_count,
          mentorId: current.mentor_id,
          startsAt: current.starts_at,
          endsAt: current.ends_at,
        });
        const activeKeys = new Set(await this.repository.findActiveOverrideKeys(client, sessionId));
        const conflicts = this.schedulingConflicts.applyOverrides(rawConflicts, activeKeys);
        if (!conflicts.every((conflict) => conflict.overridden)) throw scheduleConflict(conflicts);
      }

      const updated = await this.repository.transitionStatus(
        client,
        sessionId,
        dto.toStatus,
        dto.toStatus === SessionTransitionStatus.CANCELLED ? dto.reason ?? null : null,
        actor.id,
      );
      if (!updated) throw notFound();

      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'TRAINING_SESSION.TRANSITION',
        entityType: 'TRAINING_SESSION',
        entityId: sessionId,
        outcome: 'SUCCESS',
        summary: `${current.status} -> ${dto.toStatus}`,
        changes: [{ field: 'status', before: current.status, after: dto.toStatus }],
      });
      return updated;
    });
    return mapSession(session);
  }

  private async buildConflictReport(client: PoolClient, session: TrainingSessionRow, scopes: string[]) {
    const bay = await this.baysRepository.findScoped(session.bay_id, scopes, client);
    if (!bay) throw notFound();
    const group = await this.trainingGroupsRepository.findScoped(session.group_id, scopes, client);
    if (!group) throw notFound();

    const rawConflicts = await this.schedulingConflicts.evaluateSessionConflicts(client, {
      sessionId: session.id,
      bayId: session.bay_id,
      bayStatus: bay.status,
      bayCapacity: bay.capacity,
      requiredCapacity: group.enrolled_count,
      mentorId: session.mentor_id,
      startsAt: session.starts_at,
      endsAt: session.ends_at,
    });
    const activeKeys = new Set(await this.repository.findActiveOverrideKeys(client, session.id));
    const conflicts = this.schedulingConflicts.applyOverrides(rawConflicts, activeKeys);
    return {
      sessionId: session.id,
      evaluatedAt: new Date(),
      hasConflicts: conflicts.length > 0,
      canPublish: conflicts.every((conflict) => conflict.overridden),
      conflicts,
    };
  }
}

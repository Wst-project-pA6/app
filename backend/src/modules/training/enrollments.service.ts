import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { StudentsRepository } from './students.repository';
import { TrainingGroupsRepository } from './training-groups.repository';
import { CreateEnrollmentDto, EnrollmentListQuery, UpdateEnrollmentDto } from './dto/enrollment.dto';
import { EnrollmentRow, EnrollmentsRepository } from './enrollments.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const invalidStateTransition = (message: string): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.INVALID_STATE_TRANSITION, message);

const validationFailed = (field: string, code: string, message: string): AppError =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED, 'Validation failed', [
    { field, code, message },
  ]);

function mapConstraintError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if ((error as { code?: string })?.code === '23505') {
    throw new AppError(HttpStatus.CONFLICT, ErrorCode.DUPLICATE_RESOURCE, 'Duplicate resource');
  }
  throw error;
}

function validateSort(sort: string | undefined): void {
  if (!sort) return;
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (field !== 'enrolledAt') throw badRequest('Unknown sort field');
  }
}

function mapEnrollment(row: EnrollmentRow) {
  return {
    id: row.id,
    groupId: row.group_id,
    courseId: row.course_id,
    studentId: row.student_id,
    status: row.status,
    enrolledAt: row.enrolled_at,
    ...(row.withdrawn_at ? { withdrawnAt: row.withdrawn_at } : {}),
    ...(row.withdrawal_reason ? { withdrawalReason: row.withdrawal_reason } : {}),
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
export class EnrollmentsService {
  constructor(
    private readonly repository: EnrollmentsRepository,
    private readonly groupsRepository: TrainingGroupsRepository,
    private readonly studentsRepository: StudentsRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(groupId: string, query: EnrollmentListQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort);
    const scopes = this.scopeService.allowedScopeIds(actor);
    const group = await this.groupsRepository.findScoped(groupId, scopes);
    if (!group) throw notFound();
    const result = await this.repository.listByGroup(groupId, query);
    return mapPage(query, result.rows.map(mapEnrollment), result.totalItems);
  }

  async create(groupId: string, dto: CreateEnrollmentDto, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    try {
      const enrollment = await this.transaction.runInTransaction(async (client) => {
        const group = await this.groupsRepository.findScoped(groupId, scopes, client, true);
        if (!group) throw notFound();
        if (group.status !== 'ACTIVE') {
          throw validationFailed('/groupId', 'GROUP_CLOSED', 'Cannot enroll into a closed training group');
        }
        const student = await this.studentsRepository.findById(dto.studentId, client, true);
        if (!student) throw notFound();
        if (student.status !== 'ACTIVE') {
          throw validationFailed('/studentId', 'STUDENT_INACTIVE', 'Cannot enroll an inactive student');
        }

        const created = await this.repository.create(client, {
          groupId,
          courseId: group.course_id,
          studentId: dto.studentId,
          actor: actor.id,
        });

        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'ENROLLMENT.CREATE',
          entityType: 'ENROLLMENT',
          entityId: created.id,
          outcome: 'SUCCESS',
          summary: `Enrolled student ${dto.studentId} into group ${groupId}`,
        });
        return created;
      });
      return mapEnrollment(enrollment);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async withdraw(enrollmentId: string, dto: UpdateEnrollmentDto, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const enrollment = await this.transaction.runInTransaction(async (client) => {
      const current = await this.repository.findScoped(enrollmentId, scopes, client, true);
      if (!current) throw notFound();
      if (current.status === 'WITHDRAWN') {
        throw invalidStateTransition('A withdrawn enrollment cannot change state');
      }
      const updated = await this.repository.withdraw(client, enrollmentId, dto.reason, actor.id);
      if (!updated) throw notFound();

      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'ENROLLMENT.WITHDRAW',
        entityType: 'ENROLLMENT',
        entityId: enrollmentId,
        outcome: 'SUCCESS',
        summary: `Withdrew enrollment ${enrollmentId}: ${dto.reason}`,
      });
      return updated;
    });
    return mapEnrollment(enrollment);
  }
}

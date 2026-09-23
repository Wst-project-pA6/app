import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError, ErrorDetail } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { TrainingSessionsRepository } from './training-sessions.repository';
import { AttendanceBulkRequestDto, AttendanceListQuery } from './dto/attendance.dto';
import { AttendanceRepository, AttendanceRow } from './attendance.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const invalidState = (message: string): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.INVALID_STATE_TRANSITION, message);

function mapAttendance(row: AttendanceRow) {
  return {
    id: row.id,
    sessionId: row.session_id,
    studentId: row.student_id,
    status: row.status,
    ...(row.note ? { note: row.note } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.recorded_by,
    updatedBy: row.recorded_by,
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at,
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

const SORT_ALLOWED = new Set(['recordedAt', 'createdAt']);

function validateSort(sort: string | undefined): void {
  if (!sort) return;
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (!SORT_ALLOWED.has(field)) throw badRequest('Unknown sort field');
  }
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly repository: AttendanceRepository,
    private readonly sessionsRepository: TrainingSessionsRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async record(sessionId: string, dto: AttendanceBulkRequestDto, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const rows = await this.transaction.runInTransaction(async (client) => {
      const session = await this.sessionsRepository.findScoped(sessionId, scopes, client, true);
      if (!session) throw notFound();
      if (actor.roles.includes('MENTOR') && session.mentor_id !== actor.id) throw notFound();
      if (session.status !== 'PUBLISHED' && session.status !== 'COMPLETED') {
        throw invalidState('Attendance can only be recorded for a PUBLISHED or COMPLETED session');
      }

      const studentIds = [...new Set(dto.records.map((record) => record.studentId))];
      const activeEnrolled = await this.repository.findActiveEnrolledStudentIds(client, session.group_id, studentIds);
      const notEnrolled = studentIds.filter((id) => !activeEnrolled.has(id));
      if (notEnrolled.length > 0) {
        const details: ErrorDetail[] = notEnrolled.map((studentId) => ({
          field: '/records',
          code: 'STUDENT_NOT_ENROLLED',
          message: `Student ${studentId} does not have an ACTIVE enrollment in this session's group`,
          params: { studentId },
        }));
        throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED, 'Validation failed', details);
      }

      const before = await this.repository.findExisting(client, sessionId, studentIds);
      const beforeByStudent = new Map(before.map((row) => [row.student_id, row]));

      const updated = await this.repository.upsertBulk(
        client,
        sessionId,
        dto.records.map((record) => ({ studentId: record.studentId, status: record.status, note: record.note ?? null })),
        actor.id,
      );

      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'ATTENDANCE.RECORD',
        entityType: 'TRAINING_SESSION',
        entityId: sessionId,
        outcome: 'SUCCESS',
        summary: `Recorded attendance for ${dto.records.length} student(s) in session ${sessionId}`,
        changes: dto.records.map((record) => {
          const prior = beforeByStudent.get(record.studentId);
          return {
            field: `studentId:${record.studentId}`,
            before: prior ? { status: prior.status, note: prior.note } : null,
            after: { status: record.status, note: record.note ?? null },
          };
        }),
      });

      return updated;
    });

    const byStudent = new Map(rows.map((row) => [row.student_id, row]));
    return { items: dto.records.map((record) => mapAttendance(byStudent.get(record.studentId)!)) };
  }

  async list(query: AttendanceListQuery, actor: AuthenticatedPrincipal) {
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
    return mapPage(query, result.rows.map(mapAttendance), result.totalItems);
  }
}

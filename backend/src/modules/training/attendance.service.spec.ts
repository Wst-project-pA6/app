import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { TrainingSessionRow, TrainingSessionsRepository } from './training-sessions.repository';
import { AttendanceRepository, AttendanceRow } from './attendance.repository';
import { AttendanceService } from './attendance.service';

const scopeId = '22222222-2222-4222-8222-222222222222';
const sessionId = '11111111-1111-4111-8111-111111111111';
const groupId = '33333333-3333-4333-8333-333333333333';
const mentorId = '44444444-4444-4444-8444-444444444444';
const studentA = '55555555-5555-4555-8555-555555555555';
const studentB = '66666666-6666-4666-8666-666666666666';

const supervisorActor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'supervisor@example.test', displayName: 'Supervisor',
  preferredLocale: 'en', roles: ['TRAINING_SUPERVISOR'], permissions: ['training.read', 'training.attendance.record'],
  organizationScopeIds: [scopeId], mustChangePassword: false,
};
const mentorActor: AuthenticatedPrincipal = {
  ...supervisorActor, id: mentorId, roles: ['MENTOR'], permissions: ['training.read', 'training.attendance.record'],
};
const otherMentorActor: AuthenticatedPrincipal = {
  ...mentorActor, id: '77777777-7777-4777-8777-777777777777',
};
const studentActor: AuthenticatedPrincipal = {
  ...supervisorActor, id: '88888888-8888-4888-8888-888888888888', roles: ['STUDENT'], permissions: ['students.self'],
  organizationScopeIds: [], studentId: studentA,
};

const session = (overrides: Partial<TrainingSessionRow> = {}): TrainingSessionRow => ({
  id: sessionId, title: 'Engine Basics', course_id: 'course-1', group_id: groupId, bay_id: 'bay-1', mentor_id: mentorId,
  starts_at: new Date('2026-02-01T09:00:00Z'), ends_at: new Date('2026-02-01T11:00:00Z'), status: 'PUBLISHED',
  cancellation_reason: null, version: 1, created_at: new Date(), updated_at: new Date(), created_by: null, updated_by: null,
  active_conflict_override_count: 0,
  ...overrides,
});

function transaction(client: unknown = {}) {
  return { runInTransaction: jest.fn(async (work: (value: never) => unknown) => work(client as never)) } as unknown as TransactionService;
}

function build(overrides: { repository?: Partial<AttendanceRepository>; sessionsRepository?: Partial<TrainingSessionsRepository>; transactionService?: TransactionService } = {}) {
  const repository = {
    findActiveEnrolledStudentIds: jest.fn().mockResolvedValue(new Set([studentA, studentB])),
    findExisting: jest.fn().mockResolvedValue([]),
    upsertBulk: jest.fn().mockImplementation(async (_c: never, _s: string, records: { studentId: string; status: string; note: string | null }[]) =>
      records.map((r): AttendanceRow => ({
        id: `att-${r.studentId}`, session_id: sessionId, student_id: r.studentId, status: r.status as AttendanceRow['status'],
        note: r.note, recorded_by: supervisorActor.id, recorded_at: new Date(), created_at: new Date(), updated_at: new Date(),
      }))),
    ...overrides.repository,
  } as unknown as AttendanceRepository;
  const sessionsRepository = { findScoped: jest.fn().mockResolvedValue(session()), ...overrides.sessionsRepository } as unknown as TrainingSessionsRepository;
  const record = jest.fn().mockResolvedValue(undefined);
  const audit = { record } as unknown as AuditService;
  const service = new AttendanceService(
    repository, sessionsRepository, overrides.transactionService ?? transaction(), new ScopeService(), audit,
  );
  return { service, repository, sessionsRepository, record };
}

describe('AttendanceService.record', () => {
  it('rejects a student without an ACTIVE enrollment in the session group (422) and writes nothing', async () => {
    const upsertBulk = jest.fn();
    const { service, record } = build({ repository: { findActiveEnrolledStudentIds: jest.fn().mockResolvedValue(new Set([studentA])), upsertBulk } });
    await expect(service.record(sessionId, { records: [{ studentId: studentA, status: 'PRESENT' }, { studentId: studentB, status: 'ABSENT' }] } as never, supervisorActor))
      .rejects.toMatchObject({
        statusCode: 422, code: ErrorCode.VALIDATION_FAILED,
        details: [expect.objectContaining({ code: 'STUDENT_NOT_ENROLLED', params: { studentId: studentB } })],
      });
    expect(upsertBulk).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('conceals a session outside scope, and a session that is not this mentor\'s own, as not found', async () => {
    const { service } = build({ sessionsRepository: { findScoped: jest.fn().mockResolvedValue(null) } });
    await expect(service.record(sessionId, { records: [{ studentId: studentA, status: 'PRESENT' }] } as never, supervisorActor))
      .rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });

    const { service: otherMentorService } = build({ sessionsRepository: { findScoped: jest.fn().mockResolvedValue(session()) } });
    await expect(otherMentorService.record(sessionId, { records: [{ studentId: studentA, status: 'PRESENT' }] } as never, otherMentorActor))
      .rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
  });

  it('allows the owning mentor to record attendance for their own session', async () => {
    const { service } = build({ sessionsRepository: { findScoped: jest.fn().mockResolvedValue(session()) } });
    await expect(service.record(sessionId, { records: [{ studentId: studentA, status: 'PRESENT' }] } as never, mentorActor))
      .resolves.toMatchObject({ items: [expect.objectContaining({ studentId: studentA, status: 'PRESENT' })] });
  });

  it('rejects recording attendance for a DRAFT or CANCELLED session', async () => {
    const { service } = build({ sessionsRepository: { findScoped: jest.fn().mockResolvedValue(session({ status: 'DRAFT' })) } });
    await expect(service.record(sessionId, { records: [{ studentId: studentA, status: 'PRESENT' }] } as never, supervisorActor))
      .rejects.toMatchObject({ statusCode: 409, code: ErrorCode.INVALID_STATE_TRANSITION });
  });

  it('records attendance in one transaction and audits before/after values for every student', async () => {
    const before = [{
      id: 'att-existing', session_id: sessionId, student_id: studentA, status: 'ABSENT' as const, note: null,
      recorded_by: supervisorActor.id, recorded_at: new Date(), created_at: new Date(), updated_at: new Date(),
    }];
    const { service, record } = build({ repository: { findExisting: jest.fn().mockResolvedValue(before) } });
    await service.record(sessionId, {
      records: [{ studentId: studentA, status: 'PRESENT', note: 'Arrived late but present' }, { studentId: studentB, status: 'ABSENT' }],
    } as never, supervisorActor);
    expect(record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'ATTENDANCE.RECORD',
      entityId: sessionId,
      changes: [
        { field: `studentId:${studentA}`, before: { status: 'ABSENT', note: null }, after: { status: 'PRESENT', note: 'Arrived late but present' } },
        { field: `studentId:${studentB}`, before: null, after: { status: 'ABSENT', note: null } },
      ],
    }));
  });

  it('rolls back and never audits when the upsert fails', async () => {
    const unexpected = new Error('database unavailable');
    const { service, record } = build({ repository: { upsertBulk: jest.fn().mockRejectedValue(unexpected) } });
    await expect(service.record(sessionId, { records: [{ studentId: studentA, status: 'PRESENT' }] } as never, supervisorActor)).rejects.toBe(unexpected);
    expect(record).not.toHaveBeenCalled();
  });
});

describe('AttendanceService.list', () => {
  it('restricts a mentor to their own sessions and a self-student to their own records', async () => {
    const list = jest.fn().mockResolvedValue({ rows: [], totalItems: 0 });
    const { service } = build({ repository: { list } });
    await service.list({ page: 1, pageSize: 20 } as never, mentorActor);
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, [scopeId], { mentorId: mentorActor.id });

    await service.list({ page: 1, pageSize: 20 } as never, studentActor);
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, [], { studentId: studentA });
  });

  it('rejects an unallowlisted sort and an inverted from/to window', async () => {
    const { service } = build();
    await expect(service.list({ page: 1, pageSize: 20, sort: 'status' } as never, supervisorActor))
      .rejects.toMatchObject({ statusCode: 400, code: ErrorCode.BAD_REQUEST });
    await expect(service.list({ page: 1, pageSize: 20, from: '2026-02-02T00:00:00Z', to: '2026-02-01T00:00:00Z' } as never, supervisorActor))
      .rejects.toMatchObject({ statusCode: 400, code: ErrorCode.BAD_REQUEST });
  });
});

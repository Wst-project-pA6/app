import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { BayRow, BaysRepository } from '../bays/bays.repository';
import { EnrollmentsRepository } from './enrollments.repository';
import { MentorRow, MentorsRepository } from './mentors.repository';
import { TrainingSessionRow, TrainingSessionsRepository } from './training-sessions.repository';
import { TrainingSessionsService } from './training-sessions.service';

const scopeId = '22222222-2222-4222-8222-222222222222';
const sessionId = '11111111-1111-4111-8111-111111111111';
const courseId = '33333333-3333-4333-8333-333333333333';
const groupId = '44444444-4444-4444-8444-444444444444';
const bayId = '55555555-5555-4555-8555-555555555555';
const mentorId = '66666666-6666-4666-8666-666666666666';
const actor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'supervisor@example.test', displayName: 'Supervisor',
  preferredLocale: 'en', roles: ['TRAINING_SUPERVISOR'], permissions: ['training.read', 'training.manage'],
  organizationScopeIds: [scopeId], mustChangePassword: false,
};
const mentorActor: AuthenticatedPrincipal = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'mentor@example.test', displayName: 'Mentor',
  preferredLocale: 'en', roles: ['MENTOR'], permissions: ['training.read'],
  organizationScopeIds: [scopeId], mustChangePassword: false,
};
const studentActor: AuthenticatedPrincipal = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'student@example.test', displayName: 'Student',
  preferredLocale: 'en', roles: ['STUDENT'], permissions: ['students.self'],
  organizationScopeIds: [], studentId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', mustChangePassword: false,
};
const dto = {
  title: 'Engine Basics', courseId, groupId, bayId, mentorId,
  startsAt: '2026-02-01T09:00:00Z', endsAt: '2026-02-01T11:00:00Z',
};
const sessionRow: TrainingSessionRow = {
  id: sessionId, title: dto.title, course_id: courseId, group_id: groupId, bay_id: bayId, mentor_id: mentorId,
  starts_at: new Date(dto.startsAt), ends_at: new Date(dto.endsAt), status: 'DRAFT', cancellation_reason: null,
  version: 1, created_at: new Date(), updated_at: new Date(), created_by: actor.id, updated_by: actor.id,
};
const bayRow: BayRow = {
  id: bayId, organization_scope_id: scopeId, code: 'B1', name: 'Bay 1', capacity: 4, status: 'ACTIVE',
  created_at: new Date(), updated_at: new Date(), created_by: actor.id, updated_by: actor.id,
};
const mentorRow: MentorRow = { id: mentorId, display_name: 'Mentor One' };

function transaction(client: unknown = {}) {
  return { runInTransaction: jest.fn(async (work: (value: never) => unknown) => work(client as never)) } as unknown as TransactionService;
}

function build(overrides: {
  repository?: Partial<TrainingSessionsRepository>;
  baysRepository?: Partial<BaysRepository>;
  mentorsRepository?: Partial<MentorsRepository>;
  enrollmentsRepository?: Partial<EnrollmentsRepository>;
  transactionService?: TransactionService;
} = {}) {
  const repository = {
    findAccessibleCourse: jest.fn().mockResolvedValue({ organization_scope_id: scopeId }),
    findGroup: jest.fn().mockResolvedValue({ course_id: courseId }),
    create: jest.fn().mockResolvedValue(sessionRow),
    ...overrides.repository,
  } as unknown as TrainingSessionsRepository;
  const baysRepository = { findScoped: jest.fn().mockResolvedValue(bayRow), ...overrides.baysRepository } as unknown as BaysRepository;
  const mentorsRepository = { findEligibleMentor: jest.fn().mockResolvedValue(mentorRow), ...overrides.mentorsRepository } as unknown as MentorsRepository;
  const enrollmentsRepository = { findEnrolledGroupIds: jest.fn().mockResolvedValue([]), ...overrides.enrollmentsRepository } as unknown as EnrollmentsRepository;
  const record = jest.fn().mockResolvedValue(undefined);
  const audit = { record } as unknown as AuditService;
  const service = new TrainingSessionsService(
    repository, baysRepository, mentorsRepository, enrollmentsRepository,
    overrides.transactionService ?? transaction(), new ScopeService(), audit,
  );
  return { service, baysRepository, mentorsRepository, enrollmentsRepository, record };
}

describe('TrainingSessionsService', () => {
  it('creates a DRAFT session after validating every reference and audits it transactionally', async () => {
    const create = jest.fn().mockResolvedValue(sessionRow);
    const { service, record } = build({ repository: { create } });
    await expect(service.create(dto, actor)).resolves.toMatchObject({
      id: sessionId, status: 'DRAFT', version: 1, courseId, groupId, bayId, mentorId,
    });
    expect(create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ title: dto.title, courseId, groupId, bayId, mentorId }));
    expect(record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'TRAINING_SESSION.CREATE' }));
  });

  it('conceals an inaccessible course as not found', async () => {
    const { service } = build({ repository: { findAccessibleCourse: jest.fn().mockResolvedValue(null) } });
    await expect(service.create(dto, actor)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('rejects a group that does not belong to the given course as not found', async () => {
    const { service } = build({ repository: { findGroup: jest.fn().mockResolvedValue({ course_id: 'other-course' }) } });
    await expect(service.create(dto, actor)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('rejects an inaccessible bay as not found', async () => {
    const { service } = build({ baysRepository: { findScoped: jest.fn().mockResolvedValue(null) } });
    await expect(service.create(dto, actor)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('rejects a mentor who does not hold the MENTOR role in scope (422 validation)', async () => {
    const create = jest.fn();
    const { service } = build({
      repository: { create },
      mentorsRepository: { findEligibleMentor: jest.fn().mockResolvedValue(null) },
    });
    await expect(service.create(dto, actor)).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED, statusCode: 422 });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects an inverted time window', async () => {
    const { service } = build();
    await expect(service.create({ ...dto, startsAt: dto.endsAt, endsAt: dto.startsAt }, actor))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED, statusCode: 422 });
  });

  it('rolls back and never audits when the insert fails', async () => {
    const unexpected = new Error('database unavailable');
    const { service, record } = build({ repository: { create: jest.fn().mockRejectedValue(unexpected) } });
    await expect(service.create(dto, actor)).rejects.toBe(unexpected);
    expect(record).not.toHaveBeenCalled();
  });

  it('updates with optimistic concurrency and rejects a stale version', async () => {
    const { service } = build({
      repository: {
        findScoped: jest.fn().mockResolvedValue(sessionRow),
        update: jest.fn().mockResolvedValue({ ...sessionRow, title: 'New title', version: 2 }),
      },
    });
    await expect(service.update(sessionId, { version: 1, title: 'New title' } as never, actor))
      .resolves.toMatchObject({ title: 'New title', version: 2 });

    const { service: stale } = build({ repository: { findScoped: jest.fn().mockResolvedValue(sessionRow) } });
    await expect(stale.update(sessionId, { version: 2, title: 'New title' } as never, actor))
      .rejects.toMatchObject({ code: ErrorCode.VERSION_CONFLICT, statusCode: 409 });
  });

  it('restricts listing to a mentor\'s own sessions', async () => {
    const list = jest.fn().mockResolvedValue({ rows: [sessionRow], totalItems: 1 });
    const { service } = build({ repository: { list } });
    await service.list({ page: 1, pageSize: 20 }, mentorActor);
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, [scopeId], { mentorId: mentorActor.id });
  });

  it('restricts listing to a student\'s own group sessions', async () => {
    const list = jest.fn().mockResolvedValue({ rows: [sessionRow], totalItems: 1 });
    const enrollmentsRepository = { findEnrolledGroupIds: jest.fn().mockResolvedValue([groupId]) } as unknown as EnrollmentsRepository;
    const { service } = build({ repository: { list }, enrollmentsRepository: enrollmentsRepository as never });
    await service.list({ page: 1, pageSize: 20 }, studentActor);
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, [], { groupIds: [groupId] });
  });

  it('rejects an unallowlisted sort and an inverted from/to window', async () => {
    const { service } = build();
    await expect(service.list({ page: 1, pageSize: 20, sort: 'title' } as never, actor))
      .rejects.toMatchObject({ statusCode: 400, code: ErrorCode.BAD_REQUEST });
    await expect(service.list({
      page: 1, pageSize: 20, from: '2026-02-02T00:00:00Z', to: '2026-02-01T00:00:00Z',
    } as never, actor)).rejects.toMatchObject({ statusCode: 400, code: ErrorCode.BAD_REQUEST });
  });
});

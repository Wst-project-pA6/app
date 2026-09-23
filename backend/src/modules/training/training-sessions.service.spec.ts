import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import { SchedulingConflictService } from '../../common/scheduling/scheduling-conflict.service';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { BayRow, BaysRepository } from '../bays/bays.repository';
import { EnrollmentsRepository } from './enrollments.repository';
import { MentorRow, MentorsRepository } from './mentors.repository';
import { TrainingGroupRow, TrainingGroupsRepository } from './training-groups.repository';
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
  active_conflict_override_count: 0,
};
const bayRow: BayRow = {
  id: bayId, organization_scope_id: scopeId, code: 'B1', name: 'Bay 1', capacity: 4, status: 'ACTIVE',
  created_at: new Date(), updated_at: new Date(), created_by: actor.id, updated_by: actor.id,
};
const mentorRow: MentorRow = { id: mentorId, display_name: 'Mentor One' };
const groupRow: TrainingGroupRow = {
  id: groupId, name: 'Group', course_id: courseId, status: 'ACTIVE',
  created_at: new Date(), updated_at: new Date(), created_by: actor.id, updated_by: actor.id, enrolled_count: 2,
};

function transaction(client: unknown = {}) {
  return { runInTransaction: jest.fn(async (work: (value: never) => unknown) => work(client as never)) } as unknown as TransactionService;
}

function build(overrides: {
  repository?: Partial<TrainingSessionsRepository>;
  baysRepository?: Partial<BaysRepository>;
  mentorsRepository?: Partial<MentorsRepository>;
  enrollmentsRepository?: Partial<EnrollmentsRepository>;
  trainingGroupsRepository?: Partial<TrainingGroupsRepository>;
  schedulingConflicts?: Partial<SchedulingConflictService>;
  transactionService?: TransactionService;
} = {}) {
  const repository = {
    findAccessibleCourse: jest.fn().mockResolvedValue({ organization_scope_id: scopeId }),
    findGroup: jest.fn().mockResolvedValue({ course_id: courseId }),
    create: jest.fn().mockResolvedValue(sessionRow),
    findActiveOverrideKeys: jest.fn().mockResolvedValue([]),
    voidActiveOverrides: jest.fn().mockResolvedValue(undefined),
    ...overrides.repository,
  } as unknown as TrainingSessionsRepository;
  const baysRepository = { findScoped: jest.fn().mockResolvedValue(bayRow), ...overrides.baysRepository } as unknown as BaysRepository;
  const mentorsRepository = { findEligibleMentor: jest.fn().mockResolvedValue(mentorRow), ...overrides.mentorsRepository } as unknown as MentorsRepository;
  const enrollmentsRepository = { findEnrolledGroupIds: jest.fn().mockResolvedValue([]), ...overrides.enrollmentsRepository } as unknown as EnrollmentsRepository;
  const trainingGroupsRepository = { findScoped: jest.fn().mockResolvedValue(groupRow), ...overrides.trainingGroupsRepository } as unknown as TrainingGroupsRepository;
  const schedulingConflicts = new SchedulingConflictService();
  Object.assign(schedulingConflicts, overrides.schedulingConflicts ?? {});
  const record = jest.fn().mockResolvedValue(undefined);
  const audit = { record } as unknown as AuditService;
  const service = new TrainingSessionsService(
    repository, baysRepository, mentorsRepository, enrollmentsRepository,
    overrides.transactionService ?? transaction(), new ScopeService(), audit,
    trainingGroupsRepository, schedulingConflicts,
  );
  return { service, baysRepository, mentorsRepository, enrollmentsRepository, trainingGroupsRepository, repository, record };
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

  it('voids prior overrides and re-validates a PUBLISHED session when bay, mentor or window is reassigned', async () => {
    const published = { ...sessionRow, status: 'PUBLISHED' as const };
    const voidActiveOverrides = jest.fn().mockResolvedValue(undefined);
    const evaluateSessionConflicts = jest.fn().mockResolvedValue([]);
    const { service } = build({
      repository: {
        findScoped: jest.fn().mockResolvedValue(published),
        voidActiveOverrides,
        update: jest.fn().mockResolvedValue({ ...published, bay_id: '77777777-7777-4777-8777-777777777777', version: 2 }),
      },
      schedulingConflicts: { evaluateSessionConflicts },
    });
    await expect(service.update(sessionId, { version: 1, bayId: '77777777-7777-4777-8777-777777777777' } as never, actor))
      .resolves.toMatchObject({ version: 2 });
    expect(voidActiveOverrides).toHaveBeenCalledWith(expect.anything(), sessionId);
    expect(evaluateSessionConflicts).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mentorId }));
  });

  it('blocks a PUBLISHED reassignment that re-introduces a conflict and leaves the session unchanged', async () => {
    const published = { ...sessionRow, status: 'PUBLISHED' as const };
    const update = jest.fn();
    const conflict = {
      conflictKey: 'BAY_SESSION_CONFLICT-x', kind: 'BAY_SESSION_CONFLICT', overridable: false, overridden: false, message: 'conflict',
    };
    const { service } = build({
      repository: { findScoped: jest.fn().mockResolvedValue(published), update },
      schedulingConflicts: { evaluateSessionConflicts: jest.fn().mockResolvedValue([conflict]) },
    });
    await expect(service.update(sessionId, { version: 1, startsAt: '2026-02-01T10:00:00Z', endsAt: '2026-02-01T12:00:00Z' } as never, actor))
      .rejects.toMatchObject({ code: ErrorCode.SCHEDULE_CONFLICT, conflicts: [conflict] });
    expect(update).not.toHaveBeenCalled();
  });

  it('does not re-validate or void overrides for a DRAFT session, or for changes that touch neither bay, mentor nor window', async () => {
    const voidActiveOverrides = jest.fn();
    const evaluateSessionConflicts = jest.fn();
    const { service } = build({
      repository: {
        findScoped: jest.fn().mockResolvedValue(sessionRow),
        voidActiveOverrides,
        update: jest.fn().mockResolvedValue({ ...sessionRow, title: 'New title', version: 2 }),
      },
      schedulingConflicts: { evaluateSessionConflicts },
    });
    await expect(service.update(sessionId, { version: 1, title: 'New title' } as never, actor)).resolves.toMatchObject({ version: 2 });
    expect(voidActiveOverrides).not.toHaveBeenCalled();
    expect(evaluateSessionConflicts).not.toHaveBeenCalled();
  });
});

describe('TrainingSessionsService.checkConflicts', () => {
  it('conceals a session outside scope as not found', async () => {
    const { service } = build({ repository: { findScoped: jest.fn().mockResolvedValue(null) } });
    await expect(service.checkConflicts(sessionId, actor)).rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
  });

  it('reports canPublish true with no conflicts and false while an unresolved conflict remains', async () => {
    const conflict = { conflictKey: 'BAY_SESSION_CONFLICT-x', kind: 'BAY_SESSION_CONFLICT', overridable: false, overridden: false, message: 'conflict' };
    const evaluateSessionConflicts = jest.fn().mockResolvedValue([]);
    const { service } = build({
      repository: { findScoped: jest.fn().mockResolvedValue(sessionRow) },
      schedulingConflicts: { evaluateSessionConflicts },
    });
    await expect(service.checkConflicts(sessionId, actor)).resolves.toMatchObject({ sessionId, hasConflicts: false, canPublish: true, conflicts: [] });

    evaluateSessionConflicts.mockResolvedValue([conflict]);
    await expect(service.checkConflicts(sessionId, actor)).resolves.toMatchObject({ hasConflicts: true, canPublish: false, conflicts: [conflict] });
  });

  it('marks a conflict overridden only when an active override matches its exact key', async () => {
    const overridable = { conflictKey: 'BAY_JOB_CONFLICT-a', kind: 'BAY_JOB_CONFLICT', overridable: true, overridden: false, message: 'conflict' };
    const { service } = build({
      repository: {
        findScoped: jest.fn().mockResolvedValue(sessionRow),
        findActiveOverrideKeys: jest.fn().mockResolvedValue([overridable.conflictKey]),
      },
      schedulingConflicts: { evaluateSessionConflicts: jest.fn().mockResolvedValue([overridable]) },
    });
    await expect(service.checkConflicts(sessionId, actor)).resolves.toMatchObject({
      canPublish: true, conflicts: [expect.objectContaining({ overridden: true })],
    });
  });
});

describe('TrainingSessionsService.createOverrides', () => {
  const overridable = { conflictKey: 'BAY_JOB_CONFLICT-a', kind: 'BAY_JOB_CONFLICT', overridable: true, overridden: false, message: 'conflict' };
  const nonOverridable = { conflictKey: 'BAY_UNAVAILABLE-a', kind: 'BAY_UNAVAILABLE', overridable: false, overridden: false, message: 'conflict' };

  it('rejects a key that is not among the current, overridable conflicts before writing anything', async () => {
    const upsertOverrides = jest.fn();
    const { service, record } = build({
      repository: { findScoped: jest.fn().mockResolvedValue(sessionRow), upsertOverrides },
      schedulingConflicts: { evaluateSessionConflicts: jest.fn().mockResolvedValue([nonOverridable]) },
    });
    await expect(service.createOverrides(sessionId, { conflictKeys: [nonOverridable.conflictKey], reason: 'Approved by manager' }, actor))
      .rejects.toMatchObject({ statusCode: 409, code: ErrorCode.CONFLICT_NOT_OVERRIDABLE });
    expect(upsertOverrides).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();

    await expect(service.createOverrides(sessionId, { conflictKeys: ['BAY_JOB_CONFLICT-does-not-exist'], reason: 'Approved by manager' }, actor))
      .rejects.toMatchObject({ code: ErrorCode.CONFLICT_NOT_OVERRIDABLE });
  });

  it('authorizes an overridable conflict, audits it, and reports it overridden in the updated report', async () => {
    const upsertOverrides = jest.fn().mockResolvedValue(undefined);
    const { service, record } = build({
      repository: {
        findScoped: jest.fn().mockResolvedValue(sessionRow),
        upsertOverrides,
        findActiveOverrideKeys: jest.fn().mockResolvedValue([overridable.conflictKey]),
      },
      schedulingConflicts: { evaluateSessionConflicts: jest.fn().mockResolvedValue([overridable]) },
    });
    await expect(service.createOverrides(sessionId, { conflictKeys: [overridable.conflictKey], reason: 'Approved by manager' }, actor))
      .resolves.toMatchObject({ canPublish: true, conflicts: [expect.objectContaining({ overridden: true })] });
    expect(upsertOverrides).toHaveBeenCalledWith(expect.anything(), sessionId, [overridable.conflictKey], 'Approved by manager', actor.id);
    expect(record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'TRAINING_SESSION.CONFLICT_OVERRIDE', entityId: sessionId }));
  });
});

describe('TrainingSessionsService.transition', () => {
  const draft = sessionRow;
  const published = { ...sessionRow, status: 'PUBLISHED' as const };
  const supervisorActor: AuthenticatedPrincipal = { ...actor, permissions: ['training.read', 'training.manage'] };
  const publisherActor: AuthenticatedPrincipal = { ...actor, permissions: ['training.read', 'training.manage', 'training.publish'] };

  it('rejects a transition pair outside the allowed set', async () => {
    const { service } = build({ repository: { findScoped: jest.fn().mockResolvedValue(draft) } });
    await expect(service.transition(sessionId, { toStatus: 'COMPLETED' } as never, publisherActor))
      .rejects.toMatchObject({ code: ErrorCode.INVALID_STATE_TRANSITION });
  });

  it('requires training.publish specifically to publish, even for a manager who can otherwise reach the endpoint', async () => {
    const { service } = build({
      repository: { findScoped: jest.fn().mockResolvedValue(draft) },
      schedulingConflicts: { evaluateSessionConflicts: jest.fn().mockResolvedValue([]) },
    });
    await expect(service.transition(sessionId, { toStatus: 'PUBLISHED' } as never, supervisorActor))
      .rejects.toMatchObject({ statusCode: 403, code: ErrorCode.FORBIDDEN });
  });

  it('requires a reason to cancel', async () => {
    const { service } = build({ repository: { findScoped: jest.fn().mockResolvedValue(draft) } });
    await expect(service.transition(sessionId, { toStatus: 'CANCELLED' } as never, publisherActor))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED, statusCode: 422 });
  });

  it('blocks publishing while any conflict remains unresolved, in deterministic self-then-bay lock order, without writing the transition', async () => {
    const conflict = { conflictKey: 'BAY_SESSION_CONFLICT-x', kind: 'BAY_SESSION_CONFLICT', overridable: false, overridden: false, message: 'conflict' };
    const findScoped = jest.fn().mockResolvedValue(draft);
    const findAccessibleBay = jest.fn().mockResolvedValue(bayRow);
    const transitionStatus = jest.fn();
    const { service, record } = build({
      repository: { findScoped, transitionStatus },
      baysRepository: { findScoped: findAccessibleBay },
      schedulingConflicts: { evaluateSessionConflicts: jest.fn().mockResolvedValue([conflict]) },
    });
    await expect(service.transition(sessionId, { toStatus: 'PUBLISHED' } as never, publisherActor))
      .rejects.toMatchObject({ code: ErrorCode.SCHEDULE_CONFLICT, conflicts: [conflict] });
    expect(transitionStatus).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
    expect(findScoped.mock.calls[0]).toEqual([sessionId, [scopeId], expect.anything(), true]);
    expect(findAccessibleBay).toHaveBeenCalledWith(bayId, [scopeId], expect.anything(), true);
    expect(findScoped.mock.invocationCallOrder[0]).toBeLessThan(findAccessibleBay.mock.invocationCallOrder[0]);
  });

  it('publishes once every conflict is validly overridden, and audits the transition', async () => {
    const overridden = { conflictKey: 'BAY_JOB_CONFLICT-a', kind: 'BAY_JOB_CONFLICT', overridable: true, overridden: false, message: 'conflict' };
    const transitionStatus = jest.fn().mockResolvedValue(published);
    const { service, record } = build({
      repository: {
        findScoped: jest.fn().mockResolvedValue(draft),
        transitionStatus,
        findActiveOverrideKeys: jest.fn().mockResolvedValue([overridden.conflictKey]),
      },
      schedulingConflicts: { evaluateSessionConflicts: jest.fn().mockResolvedValue([overridden]) },
    });
    await expect(service.transition(sessionId, { toStatus: 'PUBLISHED' } as never, publisherActor)).resolves.toMatchObject({ status: 'PUBLISHED' });
    expect(transitionStatus).toHaveBeenCalledWith(expect.anything(), sessionId, 'PUBLISHED', null, publisherActor.id);
    expect(record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'TRAINING_SESSION.TRANSITION' }));
  });

  it('completes a PUBLISHED session and cancels a DRAFT session with its reason, without re-validating conflicts', async () => {
    const evaluateSessionConflicts = jest.fn();
    const transitionStatus = jest.fn()
      .mockResolvedValueOnce({ ...published, status: 'COMPLETED' })
      .mockResolvedValueOnce({ ...draft, status: 'CANCELLED', cancellation_reason: 'No longer needed' });
    const { service } = build({
      repository: { findScoped: jest.fn().mockResolvedValue(published), transitionStatus },
      schedulingConflicts: { evaluateSessionConflicts },
    });
    await expect(service.transition(sessionId, { toStatus: 'COMPLETED' } as never, publisherActor)).resolves.toMatchObject({ status: 'COMPLETED' });
    expect(evaluateSessionConflicts).not.toHaveBeenCalled();

    const { service: draftService } = build({ repository: { findScoped: jest.fn().mockResolvedValue(draft), transitionStatus } });
    await expect(draftService.transition(sessionId, { toStatus: 'CANCELLED', reason: 'No longer needed' } as never, publisherActor))
      .resolves.toMatchObject({ cancellationReason: 'No longer needed' });
    expect(transitionStatus).toHaveBeenLastCalledWith(expect.anything(), sessionId, 'CANCELLED', 'No longer needed', publisherActor.id);
  });

  it('conceals a session outside scope as not found', async () => {
    const { service } = build({ repository: { findScoped: jest.fn().mockResolvedValue(null) } });
    await expect(service.transition(sessionId, { toStatus: 'PUBLISHED' } as never, publisherActor))
      .rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
  });
});

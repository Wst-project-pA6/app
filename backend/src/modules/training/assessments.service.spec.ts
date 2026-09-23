import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { PracticalTaskRow, PracticalTasksRepository } from './practical-tasks.repository';
import { TrainingSessionRow, TrainingSessionsRepository } from './training-sessions.repository';
import { AssessmentsRepository, AssessmentWithSessionRow } from './assessments.repository';
import { AssessmentsService } from './assessments.service';

const scopeId = '22222222-2222-4222-8222-222222222222';
const sessionId = '11111111-1111-4111-8111-111111111111';
const courseId = '33333333-3333-4333-8333-333333333333';
const groupId = '44444444-4444-4444-8444-444444444444';
const mentorId = '55555555-5555-4555-8555-555555555555';
const taskId = '66666666-6666-4666-8666-666666666666';
const studentId = '77777777-7777-4777-8777-777777777777';
const assessmentId = '88888888-8888-4888-8888-888888888888';
const supervisorId = '99999999-9999-4999-8999-999999999999';

const mentorActor: AuthenticatedPrincipal = {
  id: mentorId, email: 'mentor@example.test', displayName: 'Mentor', preferredLocale: 'en',
  roles: ['MENTOR'], permissions: ['training.read', 'training.assess'], organizationScopeIds: [scopeId], mustChangePassword: false,
};
const otherMentorActor: AuthenticatedPrincipal = { ...mentorActor, id: '10101010-1010-4101-8101-101010101010' };
const supervisorActor: AuthenticatedPrincipal = {
  ...mentorActor, id: supervisorId, roles: ['TRAINING_SUPERVISOR'], permissions: ['training.read', 'training.signoff'],
};
/** Holds BOTH permissions at once, so the self-sign-off block cannot be explained away by "differing permission grants". */
const dualRoleActor: AuthenticatedPrincipal = {
  ...mentorActor, permissions: ['training.read', 'training.assess', 'training.signoff'],
};
const studentActor: AuthenticatedPrincipal = {
  ...mentorActor, id: '11111111-2222-4333-8444-555555555555', roles: ['STUDENT'], permissions: ['students.self'],
  organizationScopeIds: [], studentId,
};

const session = (overrides: Partial<TrainingSessionRow> = {}): TrainingSessionRow => ({
  id: sessionId, title: 'Engine Basics', course_id: courseId, group_id: groupId, bay_id: 'bay-1', mentor_id: mentorId,
  starts_at: new Date('2026-02-01T09:00:00Z'), ends_at: new Date('2026-02-01T11:00:00Z'), status: 'PUBLISHED',
  cancellation_reason: null, version: 1, created_at: new Date(), updated_at: new Date(), created_by: null, updated_by: null,
  active_conflict_override_count: 0,
  ...overrides,
});

const task = (overrides: Partial<PracticalTaskRow> = {}): PracticalTaskRow => ({
  id: taskId, code: 'TASK-1', title_en: 'Change oil', title_ar: null, description: null,
  competency_id: 'comp-1', expected_minutes: 30, status: 'ACTIVE',
  created_at: new Date(), updated_at: new Date(), created_by: null, updated_by: null,
  ...overrides,
});

const assessment = (overrides: Partial<AssessmentWithSessionRow> = {}): AssessmentWithSessionRow => ({
  id: assessmentId, session_id: sessionId, student_id: studentId, task_id: taskId, course_id: courseId,
  result: 'PASS', time_on_task_minutes: 25, mentor_note: null, assessed_by: mentorId, assessed_at: new Date(),
  sign_off_status: 'PENDING', signed_off_by: null, signed_off_at: null, sign_off_note: null,
  counts_toward_completion: false, version: 1, created_at: new Date(), updated_at: new Date(),
  evidence_attachment_ids: [], session_mentor_id: mentorId,
  ...overrides,
});

function transaction(client: unknown = {}) {
  return { runInTransaction: jest.fn(async (work: (value: never) => unknown) => work(client as never)) } as unknown as TransactionService;
}

function build(overrides: {
  repository?: Partial<AssessmentsRepository>;
  sessionsRepository?: Partial<TrainingSessionsRepository>;
  tasksRepository?: Partial<PracticalTasksRepository>;
  transactionService?: TransactionService;
} = {}) {
  const repository = {
    isTaskInCourse: jest.fn().mockResolvedValue(true),
    isStudentActivelyEnrolled: jest.fn().mockResolvedValue(true),
    linkEvidenceAttachments: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(assessment()),
    create: jest.fn().mockResolvedValue(assessment()),
    ...overrides.repository,
  } as unknown as AssessmentsRepository;
  const sessionsRepository = { findScoped: jest.fn().mockResolvedValue(session()), ...overrides.sessionsRepository } as unknown as TrainingSessionsRepository;
  const tasksRepository = { findById: jest.fn().mockResolvedValue(task()), ...overrides.tasksRepository } as unknown as PracticalTasksRepository;
  const record = jest.fn().mockResolvedValue(undefined);
  const audit = { record } as unknown as AuditService;
  const service = new AssessmentsService(
    repository, sessionsRepository, tasksRepository,
    overrides.transactionService ?? transaction(), new ScopeService(), audit,
  );
  return { service, repository, sessionsRepository, tasksRepository, record };
}

const createDto = { sessionId, studentId, taskId, result: 'PASS', timeOnTaskMinutes: 25 };

describe('AssessmentsService.create', () => {
  it('conceals a session outside scope, and one not belonging to the acting mentor, as not found', async () => {
    const { service } = build({ sessionsRepository: { findScoped: jest.fn().mockResolvedValue(null) } });
    await expect(service.create(createDto as never, mentorActor)).rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });

    const { service: otherService } = build();
    await expect(otherService.create(createDto as never, otherMentorActor)).rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
  });

  it('rejects an archived practical task and a task outside the session course (422)', async () => {
    const { service } = build({ tasksRepository: { findById: jest.fn().mockResolvedValue(task({ status: 'ARCHIVED' })) } });
    await expect(service.create(createDto as never, mentorActor)).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED, statusCode: 422 });

    const { service: notInCourse } = build({ repository: { isTaskInCourse: jest.fn().mockResolvedValue(false) } });
    await expect(notInCourse.create(createDto as never, mentorActor)).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED, statusCode: 422 });
  });

  it('rejects a student without an ACTIVE enrollment in the session group (422)', async () => {
    const create = jest.fn();
    const { service } = build({ repository: { isStudentActivelyEnrolled: jest.fn().mockResolvedValue(false), create } });
    await expect(service.create(createDto as never, mentorActor)).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED, statusCode: 422,
      details: [expect.objectContaining({ field: '/studentId', code: 'STUDENT_NOT_ENROLLED' })],
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('records the exact frozen result state, starts PENDING with countsTowardCompletion false, and audits it', async () => {
    const create = jest.fn().mockResolvedValue(assessment());
    const { service, record } = build({ repository: { create } });
    await expect(service.create(createDto as never, mentorActor)).resolves.toMatchObject({
      result: 'PASS', signOffStatus: 'PENDING', countsTowardCompletion: false,
    });
    expect(create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ result: 'PASS', courseId, actor: mentorActor.id }));
    expect(record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'ASSESSMENT.CREATE' }));
  });

  it('rolls back and never audits when the insert fails', async () => {
    const unexpected = new Error('database unavailable');
    const { service, record } = build({ repository: { create: jest.fn().mockRejectedValue(unexpected) } });
    await expect(service.create(createDto as never, mentorActor)).rejects.toBe(unexpected);
    expect(record).not.toHaveBeenCalled();
  });
});

describe('AssessmentsService.update', () => {
  it('conceals a missing/out-of-scope assessment and one not belonging to the acting mentor\'s session', async () => {
    const { service } = build({ repository: { findScoped: jest.fn().mockResolvedValue(null) } });
    await expect(service.update(assessmentId, { version: 1, changeReason: 'Correction' } as never, mentorActor))
      .rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });

    const { service: otherService } = build({ repository: { findScoped: jest.fn().mockResolvedValue(assessment()) } });
    await expect(otherService.update(assessmentId, { version: 1, changeReason: 'Correction' } as never, otherMentorActor))
      .rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
  });

  it('rejects a stale version before checking anything else', async () => {
    const { service } = build({ repository: { findScoped: jest.fn().mockResolvedValue(assessment({ version: 3 })) } });
    await expect(service.update(assessmentId, { version: 1, result: 'FAIL', changeReason: 'Correction' } as never, mentorActor))
      .rejects.toMatchObject({ statusCode: 409, code: ErrorCode.VERSION_CONFLICT });
  });

  it('locks a SIGNED_OFF assessment against revision (immutable once signed) without ever calling update', async () => {
    const update = jest.fn();
    const { service } = build({ repository: { findScoped: jest.fn().mockResolvedValue(assessment({ sign_off_status: 'SIGNED_OFF' })), update } });
    await expect(service.update(assessmentId, { version: 1, result: 'FAIL', changeReason: 'Correction' } as never, mentorActor))
      .rejects.toMatchObject({ statusCode: 409, code: ErrorCode.ASSESSMENT_LOCKED });
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects an empty patch (only changeReason) before writing anything', async () => {
    const update = jest.fn();
    const { service } = build({ repository: { findScoped: jest.fn().mockResolvedValue(assessment()), update } });
    await expect(service.update(assessmentId, { version: 1, changeReason: 'Just checking' } as never, mentorActor))
      .rejects.toMatchObject({ statusCode: 422, code: ErrorCode.VALIDATION_FAILED });
    expect(update).not.toHaveBeenCalled();
  });

  it('revises a PENDING assessment, audits the before/after diff, and preserves an unrelated DB failure', async () => {
    const update = jest.fn().mockResolvedValue(assessment({ result: 'FAIL', version: 2 }));
    const { service, record } = build({ repository: { findScoped: jest.fn().mockResolvedValue(assessment()), update } });
    await expect(service.update(assessmentId, { version: 1, result: 'FAIL', changeReason: 'Retested' } as never, mentorActor))
      .resolves.toMatchObject({ result: 'FAIL', version: 2 });
    expect(record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'ASSESSMENT.UPDATE', changes: [{ field: 'result', before: 'PASS', after: 'FAIL' }],
    }));

    const unexpected = new Error('database unavailable');
    const { service: failing } = build({ repository: { findScoped: jest.fn().mockResolvedValue(assessment()), update: jest.fn().mockRejectedValue(unexpected) } });
    await expect(failing.update(assessmentId, { version: 1, result: 'FAIL', changeReason: 'Retested' } as never, mentorActor)).rejects.toBe(unexpected);
  });
});

describe('AssessmentsService.signOff — separation of duties', () => {
  it('CRITICAL: rejects the same actor signing off their own assessment even when they hold both training.assess and training.signoff', async () => {
    const signOff = jest.fn();
    const { service, record } = build({ repository: { findScoped: jest.fn().mockResolvedValue(assessment({ assessed_by: dualRoleActor.id })), signOff } });
    await expect(service.signOff(assessmentId, { decision: 'SIGNED_OFF' } as never, dualRoleActor))
      .rejects.toMatchObject({ statusCode: 409, code: ErrorCode.SEPARATION_OF_DUTIES_VIOLATION });
    expect(signOff).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('allows a genuinely different actor to sign off the assessment', async () => {
    const signOff = jest.fn().mockResolvedValue(assessment({ sign_off_status: 'SIGNED_OFF', signed_off_by: supervisorId, counts_toward_completion: true, version: 2 }));
    const { service, record } = build({ repository: { findScoped: jest.fn().mockResolvedValue(assessment({ assessed_by: mentorId })), signOff } });
    await expect(service.signOff(assessmentId, { decision: 'SIGNED_OFF' } as never, supervisorActor))
      .resolves.toMatchObject({ signOffStatus: 'SIGNED_OFF', countsTowardCompletion: true });
    expect(signOff).toHaveBeenCalledWith(expect.anything(), assessmentId, expect.objectContaining({ status: 'SIGNED_OFF', actor: supervisorId, countsTowardCompletion: true }));
    expect(record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'ASSESSMENT.SIGN_OFF' }));
  });

  it('never counts toward completion for a non-PASS result even when SIGNED_OFF', async () => {
    const signOff = jest.fn().mockResolvedValue(assessment({ result: 'FAIL', sign_off_status: 'SIGNED_OFF', signed_off_by: supervisorId, counts_toward_completion: false }));
    const { service } = build({ repository: { findScoped: jest.fn().mockResolvedValue(assessment({ assessed_by: mentorId, result: 'FAIL' })), signOff } });
    await service.signOff(assessmentId, { decision: 'SIGNED_OFF' } as never, supervisorActor);
    expect(signOff).toHaveBeenCalledWith(expect.anything(), assessmentId, expect.objectContaining({ countsTowardCompletion: false }));
  });

  it('maps the frozen chk_sign_off_by_distinct_from_assessor database constraint to the same 409, as defense-in-depth', async () => {
    const dbError = { code: '23514', constraint: 'chk_sign_off_by_distinct_from_assessor' };
    const { service } = build({ repository: { findScoped: jest.fn().mockResolvedValue(assessment({ assessed_by: mentorId })), signOff: jest.fn().mockRejectedValue(dbError) } });
    await expect(service.signOff(assessmentId, { decision: 'SIGNED_OFF' } as never, supervisorActor))
      .rejects.toMatchObject({ statusCode: 409, code: ErrorCode.SEPARATION_OF_DUTIES_VIOLATION });
  });
});

describe('AssessmentsService.signOff — other rules', () => {
  it('rejects sign-off of an already SIGNED_OFF assessment (locked/immutable) before the duty check', async () => {
    const signOff = jest.fn();
    const { service } = build({ repository: { findScoped: jest.fn().mockResolvedValue(assessment({ sign_off_status: 'SIGNED_OFF', assessed_by: mentorId })), signOff } });
    await expect(service.signOff(assessmentId, { decision: 'SIGNED_OFF' } as never, supervisorActor))
      .rejects.toMatchObject({ statusCode: 409, code: ErrorCode.ASSESSMENT_LOCKED });
    expect(signOff).not.toHaveBeenCalled();
  });

  it('requires a note to RETURN an assessment and keeps it pending (not counted)', async () => {
    const signOff = jest.fn();
    const { service } = build({ repository: { findScoped: jest.fn().mockResolvedValue(assessment({ assessed_by: mentorId })), signOff } });
    await expect(service.signOff(assessmentId, { decision: 'RETURNED' } as never, supervisorActor))
      .rejects.toMatchObject({ statusCode: 422, code: ErrorCode.VALIDATION_FAILED });
    expect(signOff).not.toHaveBeenCalled();

    signOff.mockResolvedValue(assessment({ sign_off_status: 'RETURNED', signed_off_by: supervisorId, sign_off_note: 'Needs more practice', counts_toward_completion: false }));
    await expect(service.signOff(assessmentId, { decision: 'RETURNED', note: 'Needs more practice' } as never, supervisorActor))
      .resolves.toMatchObject({ signOffStatus: 'RETURNED', countsTowardCompletion: false });
  });

  it('conceals an assessment outside scope as not found', async () => {
    const { service } = build({ repository: { findScoped: jest.fn().mockResolvedValue(null) } });
    await expect(service.signOff(assessmentId, { decision: 'SIGNED_OFF' } as never, supervisorActor))
      .rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
  });
});

describe('AssessmentsService.list', () => {
  it('restricts a mentor to their own sessions and a self-student to their own results', async () => {
    const list = jest.fn().mockResolvedValue({ rows: [], totalItems: 0 });
    const { service } = build({ repository: { list } });
    await service.list({ page: 1, pageSize: 20 } as never, mentorActor);
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, [scopeId], { mentorId: mentorActor.id });

    await service.list({ page: 1, pageSize: 20 } as never, studentActor);
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, [], { studentId });
  });
});

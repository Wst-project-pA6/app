import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { StudentRow, StudentsRepository } from './students.repository';
import { TrainingGroupRow, TrainingGroupsRepository } from './training-groups.repository';
import { EnrollmentRow, EnrollmentsRepository } from './enrollments.repository';
import { EnrollmentsService } from './enrollments.service';

const scopeId = '22222222-2222-4222-8222-222222222222';
const groupId = '11111111-1111-4111-8111-111111111111';
const courseId = '33333333-3333-4333-8333-333333333333';
const studentId = '44444444-4444-4444-8444-444444444444';
const enrollmentId = '55555555-5555-4555-8555-555555555555';
const actor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'supervisor@example.test', displayName: 'Supervisor',
  preferredLocale: 'en', roles: ['TRAINING_SUPERVISOR'], permissions: ['training.read', 'training.manage'],
  organizationScopeIds: [scopeId], mustChangePassword: false,
};
const group: TrainingGroupRow = {
  id: groupId, name: 'Cohort A', course_id: courseId, status: 'ACTIVE',
  created_at: new Date(), updated_at: new Date(), created_by: actor.id, updated_by: actor.id, enrolled_count: 0,
};
const student: StudentRow = {
  id: studentId, user_id: 'uuuuuuuu-uuuu-4uuu-8uuu-uuuuuuuuuuuu', student_number: 'STU-001', status: 'ACTIVE',
  created_at: new Date(), updated_at: new Date(), created_by: actor.id, updated_by: actor.id, display_name: 'Student One',
};
const enrollment: EnrollmentRow = {
  id: enrollmentId, group_id: groupId, course_id: courseId, student_id: studentId, status: 'ACTIVE',
  enrolled_at: new Date(), withdrawn_at: null, withdrawal_reason: null,
  created_at: new Date(), updated_at: new Date(), created_by: actor.id, updated_by: actor.id,
};

function transaction(client: unknown = {}) {
  return { runInTransaction: jest.fn(async (work: (value: never) => unknown) => work(client as never)) } as unknown as TransactionService;
}

function build(overrides: {
  groupsRepository?: Partial<TrainingGroupsRepository>;
  studentsRepository?: Partial<StudentsRepository>;
  enrollmentsRepository?: Partial<EnrollmentsRepository>;
  transactionService?: TransactionService;
} = {}) {
  const groupsRepository = { findScoped: jest.fn().mockResolvedValue(group), ...overrides.groupsRepository } as unknown as TrainingGroupsRepository;
  const studentsRepository = { findById: jest.fn().mockResolvedValue(student), ...overrides.studentsRepository } as unknown as StudentsRepository;
  const enrollmentsRepository = { create: jest.fn().mockResolvedValue(enrollment), ...overrides.enrollmentsRepository } as unknown as EnrollmentsRepository;
  const record = jest.fn().mockResolvedValue(undefined);
  const audit = { record } as unknown as AuditService;
  const service = new EnrollmentsService(
    enrollmentsRepository, groupsRepository, studentsRepository,
    overrides.transactionService ?? transaction(), new ScopeService(), audit,
  );
  return { service, groupsRepository, studentsRepository, enrollmentsRepository, record };
}

describe('EnrollmentsService', () => {
  it('enrolls an active student into an active group and records the enrollment (raising group capacity/enrolledCount)', async () => {
    const create = jest.fn().mockResolvedValue(enrollment);
    const { service, record } = build({ enrollmentsRepository: { create } });
    await expect(service.create(groupId, { studentId }, actor)).resolves.toMatchObject({
      id: enrollmentId, groupId, courseId, studentId, status: 'ACTIVE',
    });
    expect(create).toHaveBeenCalledWith(expect.anything(), { groupId, courseId, studentId, actor: actor.id });
    expect(record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'ENROLLMENT.CREATE' }));
  });

  it('rejects a second ACTIVE enrollment in the same course as 409 DUPLICATE_RESOURCE (unique constraint)', async () => {
    const duplicate = { code: '23505' };
    const { service, record } = build({ enrollmentsRepository: { create: jest.fn().mockRejectedValue(duplicate) } });
    await expect(service.create(groupId, { studentId }, actor)).rejects.toMatchObject({
      code: ErrorCode.DUPLICATE_RESOURCE, statusCode: 409,
    });
    expect(record).not.toHaveBeenCalled();
  });

  it('rolls back and never audits when the insert fails with an unexpected error', async () => {
    const unexpected = new Error('database unavailable');
    const { service, record } = build({ enrollmentsRepository: { create: jest.fn().mockRejectedValue(unexpected) } });
    await expect(service.create(groupId, { studentId }, actor)).rejects.toBe(unexpected);
    expect(record).not.toHaveBeenCalled();
  });

  it('conceals an out-of-scope group as not found and rejects enrollment into a closed group', async () => {
    const { service: missing } = build({ groupsRepository: { findScoped: jest.fn().mockResolvedValue(null) } });
    await expect(missing.create(groupId, { studentId }, actor)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });

    const { service: closed } = build({ groupsRepository: { findScoped: jest.fn().mockResolvedValue({ ...group, status: 'CLOSED' }) } });
    await expect(closed.create(groupId, { studentId }, actor)).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED, statusCode: 422 });
  });

  it('rejects an unknown or inactive student', async () => {
    const { service: missing } = build({ studentsRepository: { findById: jest.fn().mockResolvedValue(null) } });
    await expect(missing.create(groupId, { studentId }, actor)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });

    const { service: inactive } = build({ studentsRepository: { findById: jest.fn().mockResolvedValue({ ...student, status: 'INACTIVE' }) } });
    await expect(inactive.create(groupId, { studentId }, actor)).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED, statusCode: 422 });
  });

  it('withdraws an active enrollment and audits it, but rejects re-withdrawing (terminal state)', async () => {
    const { service, record } = build({
      enrollmentsRepository: {
        findScoped: jest.fn().mockResolvedValue(enrollment),
        withdraw: jest.fn().mockResolvedValue({ ...enrollment, status: 'WITHDRAWN', withdrawn_at: new Date(), withdrawal_reason: 'No longer attending' }),
      },
    });
    await expect(service.withdraw(enrollmentId, { status: 'WITHDRAWN' as never, reason: 'No longer attending' }, actor))
      .resolves.toMatchObject({ status: 'WITHDRAWN', withdrawalReason: 'No longer attending' });
    expect(record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'ENROLLMENT.WITHDRAW' }));

    const { service: already } = build({
      enrollmentsRepository: { findScoped: jest.fn().mockResolvedValue({ ...enrollment, status: 'WITHDRAWN' }) },
    });
    await expect(already.withdraw(enrollmentId, { status: 'WITHDRAWN' as never, reason: 'Again' }, actor))
      .rejects.toMatchObject({ code: ErrorCode.INVALID_STATE_TRANSITION, statusCode: 409 });
  });

  it('rejects an unallowlisted sort on the enrollments list', async () => {
    const { service } = build();
    await expect(service.list(groupId, { page: 1, pageSize: 20, sort: 'status' } as never, actor))
      .rejects.toMatchObject({ statusCode: 400, code: ErrorCode.BAD_REQUEST });
  });

  it('lists enrollments of an accessible group only', async () => {
    const listByGroup = jest.fn().mockResolvedValue({ rows: [enrollment], totalItems: 1 });
    const { service } = build({ enrollmentsRepository: { listByGroup } });
    await expect(service.list(groupId, { page: 1, pageSize: 20 }, actor)).resolves.toMatchObject({
      items: [{ id: enrollmentId }],
    });

    const { service: notAccessible } = build({ groupsRepository: { findScoped: jest.fn().mockResolvedValue(null) } });
    await expect(notAccessible.list(groupId, { page: 1, pageSize: 20 }, actor)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });
});

import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { EnrollmentsRepository } from './enrollments.repository';
import { CourseRow, CoursesRepository } from './courses.repository';
import { CoursesService } from './courses.service';

const scopeId = '22222222-2222-4222-8222-222222222222';
const courseId = '11111111-1111-4111-8111-111111111111';
const termId = '33333333-3333-4333-8333-333333333333';
const taskId = '44444444-4444-4444-8444-444444444444';
const actor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'supervisor@example.test', displayName: 'Supervisor',
  preferredLocale: 'en', roles: ['TRAINING_SUPERVISOR'], permissions: ['training.read', 'training.manage'],
  organizationScopeIds: [scopeId], mustChangePassword: false,
};
const studentActor: AuthenticatedPrincipal = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'student@example.test', displayName: 'Student',
  preferredLocale: 'en', roles: ['STUDENT'], permissions: ['students.self'],
  organizationScopeIds: [], studentId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', mustChangePassword: false,
};
const row: CourseRow = {
  id: courseId, organization_scope_id: scopeId, code: 'ENG101', name_en: 'Engines', name_ar: null,
  term_id: termId, description: null, minimum_attendance_percent: 80, status: 'DRAFT',
  created_at: new Date(), updated_at: new Date(), created_by: actor.id, updated_by: actor.id,
  tasks: [{ taskId, required: true }],
};

const transaction = (client: unknown = {}) => ({
  runInTransaction: jest.fn(async (work: (value: never) => unknown) => work(client as never)),
}) as unknown as TransactionService;

function service(overrides: Partial<CoursesRepository> = {}, transactionService: TransactionService = transaction()) {
  const repository = { ...overrides } as unknown as CoursesRepository;
  const enrollments = { findEnrolledCourseIds: jest.fn().mockResolvedValue([]) } as unknown as EnrollmentsRepository;
  return { service: new CoursesService(repository, enrollments, transactionService, new ScopeService()), repository, enrollments };
}

describe('CoursesService', () => {
  it('lists scoped courses for staff and restricts students to their enrolled courses', async () => {
    const list = jest.fn().mockResolvedValue({ rows: [row], totalItems: 1 });
    const { service: staffService } = service({ list });
    await expect(staffService.list({ page: 1, pageSize: 20 }, actor)).resolves.toMatchObject({
      items: [{ id: courseId, code: 'ENG101', name: { en: 'Engines' } }],
    });
    expect(list.mock.calls[0]).toEqual([{ page: 1, pageSize: 20 }, [scopeId], undefined]);

    const studentList = jest.fn().mockResolvedValue({ rows: [row], totalItems: 1 });
    const enrollments = { findEnrolledCourseIds: jest.fn().mockResolvedValue([courseId]) } as unknown as EnrollmentsRepository;
    const studentService = new CoursesService({ list: studentList } as unknown as CoursesRepository, enrollments, transaction(), new ScopeService());
    await expect(studentService.list({ page: 1, pageSize: 20 }, studentActor)).resolves.toMatchObject({ items: [{ id: courseId }] });
    expect(studentList.mock.calls[0][2]).toEqual([courseId]);
  });

  it('rejects an unallowlisted sort', async () => {
    const list = jest.fn();
    const { service: svc } = service({ list });
    await expect(svc.list({ page: 1, pageSize: 20, sort: 'status' }, actor))
      .rejects.toMatchObject({ statusCode: 400, code: ErrorCode.BAD_REQUEST });
    expect(list).not.toHaveBeenCalled();
  });

  it('creates within scope after validating the term and referenced tasks', async () => {
    const findScoped = jest.fn().mockResolvedValue(row);
    const replaceTasks = jest.fn().mockResolvedValue(undefined);
    const { service: svc } = service({
      findActiveScope: jest.fn().mockResolvedValue(true),
      findTerm: jest.fn().mockResolvedValue({ organization_scope_id: scopeId }),
      findExistingActiveTaskIds: jest.fn().mockResolvedValue([taskId]),
      create: jest.fn().mockResolvedValue(row),
      replaceTasks,
      findScoped,
    });
    await expect(svc.create({
      organizationScopeId: scopeId, code: 'ENG101', name: { en: 'Engines' }, termId,
      tasks: [{ taskId, required: true }], minimumAttendancePercent: 80,
    }, actor)).resolves.toMatchObject({ id: courseId });
    expect(replaceTasks).toHaveBeenCalledWith(expect.anything(), courseId, [{ taskId, required: true }]);
  });

  it('conceals invalid term and task references as not found', async () => {
    const { service: wrongScope } = service({
      findActiveScope: jest.fn().mockResolvedValue(true),
      findTerm: jest.fn().mockResolvedValue({ organization_scope_id: '99999999-9999-4999-8999-999999999999' }),
    });
    await expect(wrongScope.create({
      organizationScopeId: scopeId, code: 'ENG101', name: { en: 'Engines' }, termId,
      tasks: [], minimumAttendancePercent: 80,
    }, actor)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });

    const { service: missingTask } = service({
      findActiveScope: jest.fn().mockResolvedValue(true),
      findTerm: jest.fn().mockResolvedValue({ organization_scope_id: scopeId }),
      findExistingActiveTaskIds: jest.fn().mockResolvedValue([]),
    });
    await expect(missingTask.create({
      organizationScopeId: scopeId, code: 'ENG101', name: { en: 'Engines' }, termId,
      tasks: [{ taskId, required: true }], minimumAttendancePercent: 80,
    }, actor)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('rejects duplicate taskIds in the request as a validation failure', async () => {
    const { service: svc } = service();
    await expect(svc.create({
      organizationScopeId: scopeId, code: 'ENG101', name: { en: 'Engines' }, termId,
      tasks: [{ taskId, required: true }, { taskId, required: false }], minimumAttendancePercent: 80,
    }, actor)).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED, statusCode: 422 });
  });

  it('blocks changing completion rules of an active course with enrollments (409 RESOURCE_IN_USE)', async () => {
    const activeRow = { ...row, status: 'ACTIVE' as const };
    const hasEnrollments = jest.fn().mockResolvedValue(true);
    const { service: svc } = service({
      findScoped: jest.fn().mockResolvedValue(activeRow),
      hasEnrollments,
    });
    await expect(svc.update(courseId, { minimumAttendancePercent: 90 }, actor))
      .rejects.toMatchObject({ code: ErrorCode.RESOURCE_IN_USE, statusCode: 409 });
    expect(hasEnrollments).toHaveBeenCalledWith(expect.anything(), courseId);
  });

  it('allows renaming an active course with enrollments without touching completion rules', async () => {
    const activeRow = { ...row, status: 'ACTIVE' as const };
    const hasEnrollments = jest.fn().mockResolvedValue(true);
    const { service: svc } = service({
      findScoped: jest.fn().mockResolvedValue(activeRow),
      hasEnrollments,
      update: jest.fn().mockResolvedValue({ ...activeRow, name_en: 'Renamed' }),
    });
    await expect(svc.update(courseId, { name: { en: 'Renamed' } }, actor)).resolves.toMatchObject({ name: { en: 'Renamed' } });
    expect(hasEnrollments).not.toHaveBeenCalled();
  });

  it('maps a duplicate course code and preserves unexpected database errors', async () => {
    const duplicate = { code: '23505' };
    const { service: dupService } = service({
      findActiveScope: jest.fn().mockResolvedValue(true),
      findTerm: jest.fn().mockResolvedValue({ organization_scope_id: scopeId }),
      findExistingActiveTaskIds: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockRejectedValue(duplicate),
    });
    await expect(dupService.create({
      organizationScopeId: scopeId, code: 'ENG101', name: { en: 'Engines' }, termId, tasks: [], minimumAttendancePercent: 80,
    }, actor)).rejects.toMatchObject({ code: ErrorCode.DUPLICATE_RESOURCE });

    const unexpected = new Error('database unavailable');
    const { service: failing } = service({
      findActiveScope: jest.fn().mockResolvedValue(true),
      findTerm: jest.fn().mockResolvedValue({ organization_scope_id: scopeId }),
      findExistingActiveTaskIds: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockRejectedValue(unexpected),
    });
    await expect(failing.create({
      organizationScopeId: scopeId, code: 'ENG101', name: { en: 'Engines' }, termId, tasks: [], minimumAttendancePercent: 80,
    }, actor)).rejects.toBe(unexpected);
  });
});

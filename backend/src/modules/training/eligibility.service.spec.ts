import { ScopeService } from '../../common/auth/scope.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CourseRow, CoursesRepository } from './courses.repository';
import { StudentsRepository } from './students.repository';
import { EligibilityRepository, RequiredTaskStatusRow } from './eligibility.repository';
import { EligibilityService } from './eligibility.service';

const scopeId = '22222222-2222-4222-8222-222222222222';
const studentId = '11111111-1111-4111-8111-111111111111';
const courseId = '33333333-3333-4333-8333-333333333333';
const taskId = '44444444-4444-4444-8444-444444444444';

const supervisorActor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'supervisor@example.test', displayName: 'Supervisor',
  preferredLocale: 'en', roles: ['TRAINING_SUPERVISOR'], permissions: ['training.read'],
  organizationScopeIds: [scopeId], mustChangePassword: false,
};
const selfStudentActor: AuthenticatedPrincipal = {
  ...supervisorActor, id: '55555555-5555-4555-8555-555555555555', roles: ['STUDENT'], permissions: ['students.self'],
  organizationScopeIds: [], studentId,
};
const otherStudentActor: AuthenticatedPrincipal = { ...selfStudentActor, studentId: '66666666-6666-4666-8666-666666666666' };

const course = (overrides: Partial<CourseRow> = {}): CourseRow => ({
  id: courseId, organization_scope_id: scopeId, code: 'BRK-101', name_en: 'Brakes', name_ar: null, term_id: 'term-1',
  description: null, minimum_attendance_percent: 75, status: 'ACTIVE',
  created_at: new Date(), updated_at: new Date(), created_by: null, updated_by: null, tasks: [],
  ...overrides,
});

const taskRow = (overrides: Partial<RequiredTaskStatusRow> = {}): RequiredTaskStatusRow => ({
  task_id: taskId, task_code: 'TASK-1', competency_id: 'comp-1', competency_code: 'BRAKES',
  competency_name_en: 'Brakes', competency_name_ar: null,
  latest_result: 'PASS', latest_sign_off_status: 'SIGNED_OFF', counts_toward_completion: true,
  ...overrides,
});

function build(overrides: {
  coursesRepository?: Partial<CoursesRepository>;
  studentsRepository?: Partial<StudentsRepository>;
  repository?: Partial<EligibilityRepository>;
} = {}) {
  const coursesRepository = { findScoped: jest.fn().mockResolvedValue(course()), ...overrides.coursesRepository } as unknown as CoursesRepository;
  const studentsRepository = { findById: jest.fn().mockResolvedValue({ id: studentId }), ...overrides.studentsRepository } as unknown as StudentsRepository;
  const repository = {
    findActiveEnrollment: jest.fn().mockResolvedValue({ id: 'enrollment-1' }),
    findAttendancePercent: jest.fn().mockResolvedValue('80'),
    findRequiredTaskStatuses: jest.fn().mockResolvedValue([taskRow()]),
    hasActiveCertificate: jest.fn().mockResolvedValue(false),
    computePercent: jest.fn().mockResolvedValue('100'),
    ...overrides.repository,
  } as unknown as EligibilityRepository;
  const service = new EligibilityService(coursesRepository, studentsRepository, repository, new ScopeService());
  return { service, coursesRepository, studentsRepository, repository };
}

describe('EligibilityService self-service concealment', () => {
  it('conceals coverage and eligibility for a different student behind 404, for both endpoints', async () => {
    const { service } = build();
    await expect(service.getCoverage(studentId, courseId, otherStudentActor)).rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
    await expect(service.getEligibility(studentId, courseId, otherStudentActor)).rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
  });

  it('allows a student to read their own coverage and eligibility without training.read', async () => {
    const { service } = build();
    await expect(service.getCoverage(studentId, courseId, selfStudentActor)).resolves.toMatchObject({ studentId, courseId });
    await expect(service.getEligibility(studentId, courseId, selfStudentActor)).resolves.toMatchObject({ studentId, courseId });
  });

  it('conceals a student or course outside scope as not found', async () => {
    const { service: noStudent } = build({ studentsRepository: { findById: jest.fn().mockResolvedValue(null) } });
    await expect(noStudent.getEligibility(studentId, courseId, supervisorActor)).rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });

    const { service: noCourse } = build({ coursesRepository: { findScoped: jest.fn().mockResolvedValue(null) } });
    await expect(noCourse.getEligibility(studentId, courseId, supervisorActor)).rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
  });
});

describe('EligibilityService.getCoverage', () => {
  it('groups required tasks by competency, sums signed-passed and pending counts, and omits an absent Arabic name', async () => {
    const rows = [
      taskRow({ task_id: 't1', latest_sign_off_status: 'SIGNED_OFF', counts_toward_completion: true }),
      taskRow({ task_id: 't2', latest_result: 'FAIL', latest_sign_off_status: 'SIGNED_OFF', counts_toward_completion: false }),
      taskRow({ task_id: 't3', competency_id: 'comp-2', competency_code: 'ENGINE', competency_name_en: 'Engine', competency_name_ar: 'المحرك', latest_result: null, latest_sign_off_status: 'PENDING', counts_toward_completion: false }),
    ];
    const computePercent = jest.fn().mockImplementation(async (numerator: number, denominator: number) => (denominator === 0 ? '0' : String((numerator / denominator) * 100)));
    const { service } = build({ repository: { findRequiredTaskStatuses: jest.fn().mockResolvedValue(rows), computePercent } });

    const result = await service.getCoverage(studentId, courseId, supervisorActor);

    expect(result.competencies).toHaveLength(2);
    const brakes = result.competencies.find((c) => c.code === 'BRAKES')!;
    expect(brakes).toMatchObject({ requiredTasks: 2, signedPassedRequiredTasks: 1, pendingUnsignedTasks: 0 });
    expect(brakes.name).not.toHaveProperty('ar');
    const engine = result.competencies.find((c) => c.code === 'ENGINE')!;
    expect(engine).toMatchObject({ requiredTasks: 1, signedPassedRequiredTasks: 0, pendingUnsignedTasks: 1, name: { en: 'Engine', ar: 'المحرك' } });
    expect(computePercent).toHaveBeenCalledWith(1, 3); // overall: 1 signed-passed of 3 required
  });

  it('reports 0% coverage rather than dividing by zero when the course has no required tasks', async () => {
    const computePercent = jest.fn().mockResolvedValue('0');
    const { service } = build({ repository: { findRequiredTaskStatuses: jest.fn().mockResolvedValue([]), computePercent } });
    await service.getCoverage(studentId, courseId, supervisorActor);
    expect(computePercent).toHaveBeenCalledWith(0, 0);
  });
});

describe('EligibilityService eligibility boundaries', () => {
  it('is eligible when attendance is exactly at the minimum (meets, not exceeds)', async () => {
    const { service } = build({ repository: { findAttendancePercent: jest.fn().mockResolvedValue('75') } });
    const result = await service.getEligibility(studentId, courseId, supervisorActor);
    expect(result).toMatchObject({ eligible: true, attendancePercent: '75', minimumAttendancePercent: 75 });
    expect(result.unmetConditions).toEqual([]);
  });

  it('is ineligible when attendance is one point short of the minimum', async () => {
    const { service } = build({ repository: { findAttendancePercent: jest.fn().mockResolvedValue('74') } });
    const result = await service.getEligibility(studentId, courseId, supervisorActor);
    expect(result.eligible).toBe(false);
    expect(result.unmetConditions).toEqual([
      expect.objectContaining({ code: 'ATTENDANCE_BELOW_MINIMUM' }),
    ]);
  });

  it('reports ENROLLMENT_NOT_ACTIVE when there is no ACTIVE enrollment', async () => {
    const { service } = build({ repository: { findActiveEnrollment: jest.fn().mockResolvedValue(null) } });
    const result = await service.getEligibility(studentId, courseId, supervisorActor);
    expect(result.eligible).toBe(false);
    expect(result.unmetConditions).toContainEqual(expect.objectContaining({ code: 'ENROLLMENT_NOT_ACTIVE' }));
  });

  it('reports REQUIRED_TASK_NOT_PASSED for a task never attempted or failed, distinct from ASSESSMENT_UNSIGNED for a passed-but-unsigned task', async () => {
    const neverAttempted = taskRow({ task_id: 'never', latest_result: null, latest_sign_off_status: null, counts_toward_completion: false });
    const failed = taskRow({ task_id: 'failed', latest_result: 'FAIL', latest_sign_off_status: 'SIGNED_OFF', counts_toward_completion: false });
    const passedUnsigned = taskRow({ task_id: 'unsigned', latest_result: 'PASS', latest_sign_off_status: 'PENDING', counts_toward_completion: false });
    const passedSigned = taskRow({ task_id: 'ok', latest_result: 'PASS', latest_sign_off_status: 'SIGNED_OFF', counts_toward_completion: true });
    const { service } = build({ repository: { findRequiredTaskStatuses: jest.fn().mockResolvedValue([neverAttempted, failed, passedUnsigned, passedSigned]) } });

    const result = await service.getEligibility(studentId, courseId, supervisorActor);

    expect(result.unmetConditions).toContainEqual(expect.objectContaining({ code: 'REQUIRED_TASK_NOT_PASSED', taskId: 'never' }));
    expect(result.unmetConditions).toContainEqual(expect.objectContaining({ code: 'REQUIRED_TASK_NOT_PASSED', taskId: 'failed' }));
    expect(result.unmetConditions).toContainEqual(expect.objectContaining({ code: 'ASSESSMENT_UNSIGNED', taskId: 'unsigned' }));
    expect(result.unmetConditions.some((c) => c.taskId === 'ok')).toBe(false);
  });

  it('reports CERTIFICATE_ALREADY_ISSUED when an ISSUED certificate already exists for this course', async () => {
    const { service } = build({ repository: { hasActiveCertificate: jest.fn().mockResolvedValue(true) } });
    const result = await service.getEligibility(studentId, courseId, supervisorActor);
    expect(result.eligible).toBe(false);
    expect(result.unmetConditions).toContainEqual(expect.objectContaining({ code: 'CERTIFICATE_ALREADY_ISSUED' }));
  });

  it('is eligible only when every condition is independently satisfied, and reports every unmet condition at once', async () => {
    const { service } = build({
      repository: {
        findActiveEnrollment: jest.fn().mockResolvedValue(null),
        findAttendancePercent: jest.fn().mockResolvedValue('10'),
        findRequiredTaskStatuses: jest.fn().mockResolvedValue([taskRow({ latest_result: 'FAIL', counts_toward_completion: false })]),
        hasActiveCertificate: jest.fn().mockResolvedValue(true),
      },
    });
    const result = await service.getEligibility(studentId, courseId, supervisorActor);
    expect(result.eligible).toBe(false);
    expect(result.unmetConditions.map((c) => c.code).sort()).toEqual(
      ['ATTENDANCE_BELOW_MINIMUM', 'CERTIFICATE_ALREADY_ISSUED', 'ENROLLMENT_NOT_ACTIVE', 'REQUIRED_TASK_NOT_PASSED'].sort(),
    );
  });
});

describe('EligibilityService.evaluate and lockActiveEnrollment (used directly by certificate issuance)', () => {
  it('evaluate() takes an explicit minimumAttendancePercent and an optional transaction client', async () => {
    const findActiveEnrollment = jest.fn().mockResolvedValue({ id: 'enrollment-1' });
    const { repository } = build({ repository: { findActiveEnrollment } });
    const service = new EligibilityService({} as CoursesRepository, {} as StudentsRepository, repository, new ScopeService());
    const client = {} as never;
    const result = await service.evaluate(studentId, courseId, 75, client);
    expect(result).toMatchObject({ eligible: true, attendancePercent: '80' });
    expect(findActiveEnrollment).toHaveBeenCalledWith(studentId, courseId, client);
  });

  it('lockActiveEnrollment locks the row (delegates to findActiveEnrollment with lock=true)', async () => {
    const findActiveEnrollment = jest.fn().mockResolvedValue({ id: 'enrollment-1' });
    const { repository } = build({ repository: { findActiveEnrollment } });
    const service = new EligibilityService({} as CoursesRepository, {} as StudentsRepository, repository, new ScopeService());
    const client = {} as never;
    await service.lockActiveEnrollment(client, studentId, courseId);
    expect(findActiveEnrollment).toHaveBeenCalledWith(studentId, courseId, client, true);
  });
});

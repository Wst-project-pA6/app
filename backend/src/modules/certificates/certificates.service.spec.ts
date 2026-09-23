import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import { CourseRow, CoursesRepository } from '../training/courses.repository';
import { EligibilityEvaluation, EligibilityService } from '../training/eligibility.service';
import { StudentsRepository } from '../training/students.repository';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CertificateRow, CertificatesRepository } from './certificates.repository';
import { CertificatesService } from './certificates.service';

const scopeId = '22222222-2222-4222-8222-222222222222';
const studentId = '11111111-1111-4111-8111-111111111111';
const courseId = '33333333-3333-4333-8333-333333333333';
const certificateId = '44444444-4444-4444-8444-444444444444';
const enrollmentId = '55555555-5555-4555-8555-555555555555';

const supervisorActor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'supervisor@example.test', displayName: 'Supervisor',
  preferredLocale: 'en', roles: ['TRAINING_SUPERVISOR'], permissions: ['training.read', 'certificates.issue', 'certificates.revoke'],
  organizationScopeIds: [scopeId], mustChangePassword: false,
};
const otherSupervisorActor: AuthenticatedPrincipal = { ...supervisorActor, id: '99999999-9999-4999-8999-999999999999' };
const selfStudentActor: AuthenticatedPrincipal = {
  ...supervisorActor, id: '66666666-6666-4666-8666-666666666666', roles: ['STUDENT'], permissions: ['students.self'],
  organizationScopeIds: [], studentId,
};
const otherStudentActor: AuthenticatedPrincipal = { ...selfStudentActor, studentId: '77777777-7777-4777-8777-777777777777' };

const course = (overrides: Partial<CourseRow> = {}): CourseRow => ({
  id: courseId, organization_scope_id: scopeId, code: 'BRK-101', name_en: 'Brakes', name_ar: null, term_id: 'term-1',
  description: null, minimum_attendance_percent: 75, status: 'ACTIVE',
  created_at: new Date(), updated_at: new Date(), created_by: null, updated_by: null, tasks: [],
  ...overrides,
});

const certificate = (overrides: Partial<CertificateRow> = {}): CertificateRow => ({
  id: certificateId, certificate_number: 'CERT-2026-000001', student_id: studentId, course_id: courseId,
  enrollment_id: enrollmentId, issued_at: new Date(), issued_by: supervisorActor.id, status: 'ISSUED',
  revoked_at: null, revoked_by: null, revocation_reason: null, idempotency_key: null, created_at: new Date(),
  ...overrides,
});

const eligible: EligibilityEvaluation = { attendancePercent: '90', eligible: true, unmetConditions: [] };
const ineligible: EligibilityEvaluation = {
  attendancePercent: '40', eligible: false,
  unmetConditions: [{ code: 'ATTENDANCE_BELOW_MINIMUM', message: 'Attendance 40% is below the required minimum of 75%' }],
};

function transaction(client: unknown = {}) {
  return { runInTransaction: jest.fn(async (work: (value: never) => unknown) => work(client as never)) } as unknown as TransactionService;
}

function build(overrides: {
  repository?: Partial<CertificatesRepository>;
  coursesRepository?: Partial<CoursesRepository>;
  studentsRepository?: Partial<StudentsRepository>;
  eligibility?: Partial<EligibilityService>;
  transactionService?: TransactionService;
} = {}) {
  const repository = {
    acquireIdempotencyLock: jest.fn().mockResolvedValue(undefined),
    findByIdempotencyKey: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(certificate()),
    list: jest.fn().mockResolvedValue({ rows: [], totalItems: 0 }),
    ...overrides.repository,
  } as unknown as CertificatesRepository;
  const coursesRepository = { findScoped: jest.fn().mockResolvedValue(course()), ...overrides.coursesRepository } as unknown as CoursesRepository;
  const studentsRepository = { findById: jest.fn().mockResolvedValue({ id: studentId }), ...overrides.studentsRepository } as unknown as StudentsRepository;
  const eligibility = {
    lockActiveEnrollment: jest.fn().mockResolvedValue({ id: enrollmentId }),
    evaluate: jest.fn().mockResolvedValue(eligible),
    ...overrides.eligibility,
  } as unknown as EligibilityService;
  const record = jest.fn().mockResolvedValue(undefined);
  const audit = { record } as unknown as AuditService;
  const service = new CertificatesService(
    repository, coursesRepository, studentsRepository, eligibility,
    overrides.transactionService ?? transaction(), new ScopeService(), audit,
  );
  return { service, repository, coursesRepository, studentsRepository, eligibility, record };
}

describe('CertificatesService.issue', () => {
  it('conceals a missing student or course as not found before ever locking anything', async () => {
    const lockActiveEnrollment = jest.fn();
    const { service } = build({ studentsRepository: { findById: jest.fn().mockResolvedValue(null) }, eligibility: { lockActiveEnrollment } });
    await expect(service.issue({ studentId, courseId } as never, supervisorActor)).rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
    expect(lockActiveEnrollment).not.toHaveBeenCalled();

    const lockActiveEnrollmentForMissingCourse = jest.fn();
    const { service: noCourse } = build({
      coursesRepository: { findScoped: jest.fn().mockResolvedValue(null) },
      eligibility: { lockActiveEnrollment: lockActiveEnrollmentForMissingCourse },
    });
    await expect(noCourse.issue({ studentId, courseId } as never, supervisorActor)).rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
    expect(lockActiveEnrollmentForMissingCourse).not.toHaveBeenCalled();
  });

  it('locks the enrollment before re-evaluating eligibility, in that exact order', async () => {
    const lockActiveEnrollment = jest.fn().mockResolvedValue({ id: enrollmentId });
    const evaluate = jest.fn().mockResolvedValue(eligible);
    const { service } = build({ eligibility: { lockActiveEnrollment, evaluate } });
    await service.issue({ studentId, courseId } as never, supervisorActor);
    expect(lockActiveEnrollment.mock.invocationCallOrder[0]).toBeLessThan(evaluate.mock.invocationCallOrder[0]);
  });

  it('rejects with 409 CERTIFICATE_NOT_ELIGIBLE listing every unmet condition, and never writes a certificate', async () => {
    const create = jest.fn();
    const { service, record } = build({ repository: { create }, eligibility: { evaluate: jest.fn().mockResolvedValue(ineligible) } });
    await expect(service.issue({ studentId, courseId } as never, supervisorActor)).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCode.CERTIFICATE_NOT_ELIGIBLE,
      details: [expect.objectContaining({ code: 'ATTENDANCE_BELOW_MINIMUM' })],
    });
    expect(create).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('issues with a fresh 256-bit token, stores only its hash, and returns the raw token exactly once', async () => {
    const create = jest.fn().mockImplementation(async () => certificate({ id: certificateId }));
    const { service, record } = build({ repository: { create } });

    const result = await service.issue({ studentId, courseId } as never, supervisorActor);

    expect(result).toMatchObject({ id: certificateId, status: 'ISSUED', certificateNumber: 'CERT-2026-000001' });
    expect(result.verificationToken).toMatch(/^[A-Za-z0-9_-]{43,86}$/u);
    expect(create.mock.calls[0][1]).toMatchObject({ studentId, courseId, enrollmentId, issuedBy: supervisorActor.id });
    expect(create.mock.calls[0][1].tokenHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(create.mock.calls[0][1].tokenHash).not.toBe(result.verificationToken);
    expect(record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'CERTIFICATE.ISSUE', entityId: certificateId }));
  });

  it('rolls back and never audits when the insert fails', async () => {
    const unexpected = new Error('database unavailable');
    const { service, record } = build({ repository: { create: jest.fn().mockRejectedValue(unexpected) } });
    await expect(service.issue({ studentId, courseId } as never, supervisorActor)).rejects.toBe(unexpected);
    expect(record).not.toHaveBeenCalled();
  });

  it('maps the frozen uq_certificates_one_active_per_enrollment race to 409 CERTIFICATE_NOT_ELIGIBLE, as defense-in-depth', async () => {
    const dbError = { code: '23505', constraint: 'uq_certificates_one_active_per_enrollment' };
    const { service } = build({ repository: { create: jest.fn().mockRejectedValue(dbError) } });
    await expect(service.issue({ studentId, courseId } as never, supervisorActor))
      .rejects.toMatchObject({ statusCode: 409, code: ErrorCode.CERTIFICATE_NOT_ELIGIBLE });
  });

  describe('idempotency', () => {
    it('serializes concurrent same-key requests by acquiring the advisory lock before lookup', async () => {
      const acquireLock = jest.fn().mockResolvedValue(undefined);
      const findByIdempotencyKey = jest.fn().mockResolvedValue(null);
      const { service } = build({ repository: { acquireIdempotencyLock: acquireLock, findByIdempotencyKey } });
      await service.issue({ studentId, courseId } as never, supervisorActor, 'a-valid-key-123');
      expect(acquireLock).toHaveBeenCalledWith(expect.anything(), 'certificate', 'a-valid-key-123');
      expect(acquireLock.mock.invocationCallOrder[0]).toBeLessThan(findByIdempotencyKey.mock.invocationCallOrder[0]);
    });

    it('replays an identical same-caller, same-body request without issuing a second certificate', async () => {
      const existing = certificate({ idempotency_key: 'a-valid-key-123' });
      const create = jest.fn();
      const findScoped = jest.fn().mockResolvedValue(course());
      const { service, record } = build({
        repository: { findByIdempotencyKey: jest.fn().mockResolvedValue(existing), create },
        coursesRepository: { findScoped },
      });
      const result = await service.issue({ studentId, courseId } as never, supervisorActor, 'a-valid-key-123');
      expect(result).toMatchObject({ id: certificateId });
      expect(result).not.toHaveProperty('verificationToken');
      expect(create).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
      expect(findScoped).toHaveBeenCalledWith(existing.course_id, expect.anything(), expect.anything());
    });

    it('rejects a replay when the caller\'s current scope no longer covers the course', async () => {
      const existing = certificate({ idempotency_key: 'a-valid-key-123' });
      const { service } = build({
        repository: { findByIdempotencyKey: jest.fn().mockResolvedValue(existing) },
        coursesRepository: { findScoped: jest.fn().mockResolvedValue(null) },
      });
      await expect(service.issue({ studentId, courseId } as never, supervisorActor, 'a-valid-key-123'))
        .rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
    });

    it('rejects a replayed key whose body differs (student, course, or issuer) with 409 IDEMPOTENCY_CONFLICT', async () => {
      const existing = certificate({ idempotency_key: 'a-valid-key-123', course_id: 'a-different-course' });
      const { service } = build({ repository: { findByIdempotencyKey: jest.fn().mockResolvedValue(existing) } });
      await expect(service.issue({ studentId, courseId } as never, supervisorActor, 'a-valid-key-123'))
        .rejects.toMatchObject({ statusCode: 409, code: ErrorCode.IDEMPOTENCY_CONFLICT });
    });

    it('maps the uq_certificates_idempotency race condition to 409 IDEMPOTENCY_CONFLICT', async () => {
      const dbError = { code: '23505', constraint: 'uq_certificates_idempotency' };
      const { service } = build({ repository: { create: jest.fn().mockRejectedValue(dbError) } });
      await expect(service.issue({ studentId, courseId } as never, supervisorActor, 'a-valid-key-123'))
        .rejects.toMatchObject({ statusCode: 409, code: ErrorCode.IDEMPOTENCY_CONFLICT });
    });
  });

  describe('concurrency: two overlapping issue attempts for the same student and course', () => {
    it('CRITICAL: only one of two concurrent issue attempts succeeds; the second sees the first\'s committed certificate and is rejected', async () => {
      // Models real Postgres row locking: acquiring the enrollment lock only "returns" for the
      // second caller once the first has released it (committed), at which point a fresh
      // eligibility check runs and sees the winner's now-existing certificate.
      let locked = false;
      let releaseWaiter: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => { releaseWaiter = resolve; });
      let issuedCertificate: CertificateRow | null = null;

      const lockActiveEnrollment = jest.fn(async () => {
        if (!locked) {
          locked = true;
        } else {
          await gate;
        }
        return { id: enrollmentId };
      });
      const evaluate = jest.fn(async (): Promise<EligibilityEvaluation> => (
        issuedCertificate
          ? { attendancePercent: '90', eligible: false, unmetConditions: [{ code: 'CERTIFICATE_ALREADY_ISSUED', message: 'Already issued' }] }
          : eligible
      ));
      let nextSuffix = 0;
      const create = jest.fn(async (_client: never, data: { studentId: string; courseId: string; issuedBy: string; tokenHash: string }) => {
        nextSuffix += 1;
        const row = certificate({ id: `cert-${nextSuffix}`, issued_by: data.issuedBy });
        issuedCertificate = row;
        releaseWaiter?.();
        return row;
      });

      const { service } = build({ repository: { create }, eligibility: { lockActiveEnrollment, evaluate } });

      const [outcomeA, outcomeB] = await Promise.allSettled([
        service.issue({ studentId, courseId } as never, supervisorActor),
        service.issue({ studentId, courseId } as never, otherSupervisorActor),
      ]);

      const outcomes = [outcomeA, outcomeB];
      const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
      const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject({ statusCode: 409, code: ErrorCode.CERTIFICATE_NOT_ELIGIBLE });
      expect(create).toHaveBeenCalledTimes(1);
    });
  });
});

describe('CertificatesService.get', () => {
  it('conceals a certificate outside scope, and another student\'s certificate from a self-service student, as not found', async () => {
    const { service } = build({ repository: { findScoped: jest.fn().mockResolvedValue(null) } });
    await expect(service.get(certificateId, supervisorActor)).rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });

    const { service: selfService } = build({ repository: { findScoped: jest.fn().mockResolvedValue(certificate()) } });
    await expect(selfService.get(certificateId, otherStudentActor)).rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
  });

  it('allows a student to read their own certificate, and never includes a verification token on a re-fetch', async () => {
    const { service } = build({ repository: { findScoped: jest.fn().mockResolvedValue(certificate()) } });
    const result = await service.get(certificateId, selfStudentActor);
    expect(result).toMatchObject({ id: certificateId, status: 'ISSUED' });
    expect(result).not.toHaveProperty('verificationToken');
  });
});

describe('CertificatesService.list', () => {
  it('restricts a self-service student to their own certificates and returns empty without a student profile', async () => {
    const list = jest.fn().mockResolvedValue({ rows: [certificate()], totalItems: 1 });
    const { service } = build({ repository: { list } });
    await service.list({ page: 1, pageSize: 20 } as never, selfStudentActor);
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, [], { studentId });

    const noProfile = { ...selfStudentActor, studentId: undefined };
    const emptyList = jest.fn();
    const { service: emptyService } = build({ repository: { list: emptyList } });
    await expect(emptyService.list({ page: 1, pageSize: 20 } as never, noProfile)).resolves.toMatchObject({ items: [] });
    expect(emptyList).not.toHaveBeenCalled();
  });
});

describe('CertificatesService.revoke', () => {
  it('rejects revoking an already-revoked certificate and never audits it again', async () => {
    const { service, record } = build({ repository: { findScoped: jest.fn().mockResolvedValue(certificate({ status: 'REVOKED' })) } });
    await expect(service.revoke(certificateId, { reason: 'Duplicate revoke attempt' } as never, supervisorActor))
      .rejects.toMatchObject({ statusCode: 409, code: ErrorCode.INVALID_STATE_TRANSITION });
    expect(record).not.toHaveBeenCalled();
  });

  it('revokes an ISSUED certificate, records who and why, and audits the before/after status', async () => {
    const revoke = jest.fn().mockResolvedValue(certificate({ status: 'REVOKED', revoked_by: supervisorActor.id, revocation_reason: 'Fraudulent submission' }));
    const { service, record } = build({ repository: { findScoped: jest.fn().mockResolvedValue(certificate()), revoke } });
    const result = await service.revoke(certificateId, { reason: 'Fraudulent submission' } as never, supervisorActor);
    expect(result).toMatchObject({ status: 'REVOKED', revocationReason: 'Fraudulent submission' });
    expect(revoke).toHaveBeenCalledWith(expect.anything(), certificateId, supervisorActor.id, 'Fraudulent submission');
    expect(record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'CERTIFICATE.REVOKE', changes: [{ field: 'status', before: 'ISSUED', after: 'REVOKED' }],
    }));
  });

  it('conceals a certificate outside scope as not found', async () => {
    const { service } = build({ repository: { findScoped: jest.fn().mockResolvedValue(null) } });
    await expect(service.revoke(certificateId, { reason: 'Any reason at all' } as never, supervisorActor))
      .rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
  });
});

describe('CertificatesService.verifyPublic', () => {
  it('returns the exact same 404 for a malformed token (no database lookup) and for a well-formed but unknown token', async () => {
    const findByTokenHash = jest.fn().mockResolvedValue(null);
    const { service } = build({ repository: { findByTokenHash } });

    const malformed = await service.verifyPublic('too-short').catch((error) => error);
    expect(findByTokenHash).not.toHaveBeenCalled();

    const unknown = await service.verifyPublic('a'.repeat(43)).catch((error) => error);
    expect(findByTokenHash).toHaveBeenCalledTimes(1);

    expect(malformed).toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
    expect(unknown).toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
    expect(malformed.message).toBe(unknown.message);
    expect(malformed.details).toEqual(unknown.details);
  });

  it('returns only the safe public fields for an ISSUED certificate, reduced to given name plus family initial', async () => {
    const findByTokenHash = jest.fn().mockResolvedValue({
      certificate_number: 'CERT-2026-000017', status: 'ISSUED', holder_display_name: 'Sara Mahmoud',
      course_name_en: 'Brake Systems Fundamentals', course_name_ar: 'أساسيات أنظمة الفرامل',
      issued_at: new Date('2026-09-30T10:00:00Z'), revoked_at: null,
    });
    const { service } = build({ repository: { findByTokenHash } });
    const result = await service.verifyPublic('a'.repeat(43));
    expect(result).toEqual({
      certificateNumber: 'CERT-2026-000017', status: 'ISSUED', holderDisplayName: 'Sara M.',
      courseName: { en: 'Brake Systems Fundamentals', ar: 'أساسيات أنظمة الفرامل' },
      issuedAt: new Date('2026-09-30T10:00:00Z'),
    });
    expect(result).not.toHaveProperty('revokedAt');
  });

  it('still verifies a REVOKED certificate (status REVOKED plus revocation date), rather than 404', async () => {
    const findByTokenHash = jest.fn().mockResolvedValue({
      certificate_number: 'CERT-2026-000017', status: 'REVOKED', holder_display_name: 'Sara Mahmoud',
      course_name_en: 'Brakes', course_name_ar: null,
      issued_at: new Date('2026-09-30T10:00:00Z'), revoked_at: new Date('2026-10-05T08:00:00Z'),
    });
    const { service } = build({ repository: { findByTokenHash } });
    const result = await service.verifyPublic('a'.repeat(43));
    expect(result).toMatchObject({ status: 'REVOKED', revokedAt: new Date('2026-10-05T08:00:00Z') });
  });

  it('keeps a single-word holder name as-is (nothing to abbreviate)', async () => {
    const findByTokenHash = jest.fn().mockResolvedValue({
      certificate_number: 'CERT-2026-000017', status: 'ISSUED', holder_display_name: 'Madonna',
      course_name_en: 'Brakes', course_name_ar: null, issued_at: new Date(), revoked_at: null,
    });
    const { service } = build({ repository: { findByTokenHash } });
    const result = await service.verifyPublic('a'.repeat(43));
    expect(result.holderDisplayName).toBe('Madonna');
  });
});

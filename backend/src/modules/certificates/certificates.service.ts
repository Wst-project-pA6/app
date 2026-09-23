import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError, ErrorDetail } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { CoursesRepository } from '../training/courses.repository';
import { EligibilityService, UnmetCondition } from '../training/eligibility.service';
import { StudentsRepository } from '../training/students.repository';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { generateVerificationToken, hashVerificationToken } from './certificate-token.util';
import { CertificateIssueDto, CertificateListQuery, RevokeCertificateDto } from './dto/certificate.dto';
import { CertificateRow, CertificatesRepository, PublicCertificateRow } from './certificates.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const notFoundPublic = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Certificate not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const invalidState = (message: string): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.INVALID_STATE_TRANSITION, message);

const idempotencyConflict = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.IDEMPOTENCY_CONFLICT, 'Idempotency-Key was already used for a different request');

function unmetConditionDetails(unmetConditions: UnmetCondition[]): ErrorDetail[] {
  return unmetConditions.map((condition) => ({
    code: condition.code,
    message: condition.message,
    ...(condition.taskId ? { params: { taskId: condition.taskId } } : {}),
  }));
}

const certificateNotEligible = (unmetConditions: UnmetCondition[]): AppError =>
  new AppError(
    HttpStatus.CONFLICT,
    ErrorCode.CERTIFICATE_NOT_ELIGIBLE,
    'Student is not eligible for a certificate',
    unmetConditionDetails(unmetConditions),
  );

function mapConstraintError(error: unknown): never {
  if (error instanceof AppError) throw error;
  const dbError = error as { code?: string; constraint?: string };
  if (dbError?.code === '23505' && dbError.constraint === 'uq_certificates_idempotency') {
    throw idempotencyConflict();
  }
  if (dbError?.code === '23505' && dbError.constraint === 'uq_certificates_one_active_per_enrollment') {
    throw certificateNotEligible([{ code: 'CERTIFICATE_ALREADY_ISSUED', message: 'A certificate has already been issued for this enrollment' }]);
  }
  throw error;
}

/** `rawToken` is only ever set immediately after generation (the issue response); it is never persisted, so it is never present on a re-fetched row. */
function mapCertificate(row: CertificateRow, rawToken?: string) {
  return {
    id: row.id,
    certificateNumber: row.certificate_number,
    studentId: row.student_id,
    courseId: row.course_id,
    issuedAt: row.issued_at,
    issuedBy: row.issued_by,
    status: row.status,
    ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}),
    ...(row.revoked_by ? { revokedBy: row.revoked_by } : {}),
    ...(row.revocation_reason ? { revocationReason: row.revocation_reason } : {}),
    ...(rawToken ? { verificationToken: rawToken } : {}),
    createdAt: row.created_at,
    updatedAt: row.revoked_at ?? row.created_at,
    createdBy: row.issued_by,
    updatedBy: row.revoked_by ?? row.issued_by,
  };
}

function mapPublicVerification(row: PublicCertificateRow) {
  return {
    certificateNumber: row.certificate_number,
    status: row.status,
    holderDisplayName: toPublicDisplayName(row.holder_display_name),
    courseName: { en: row.course_name_en, ...(row.course_name_ar ? { ar: row.course_name_ar } : {}) },
    issuedAt: row.issued_at,
    ...(row.revoked_at ? { revokedAt: row.revoked_at } : {}),
  };
}

/** Given name plus family initial only (e.g. "Sara Mahmoud" -> "Sara M."); never the full name. */
function toPublicDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/u).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? fullName;
  const givenName = parts[0];
  const familyInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${givenName} ${familyInitial}.`;
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

const SORT_ALLOWED = new Set(['issuedAt', 'certificateNumber']);

function validateSort(sort: string | undefined): void {
  if (!sort) return;
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (!SORT_ALLOWED.has(field)) throw badRequest('Unknown sort field');
  }
}

/** VerificationToken parameter shape (frozen contract): reject anything else before ever hashing/querying. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43,86}$/u;

@Injectable()
export class CertificatesService {
  constructor(
    private readonly repository: CertificatesRepository,
    private readonly coursesRepository: CoursesRepository,
    private readonly studentsRepository: StudentsRepository,
    private readonly eligibility: EligibilityService,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(query: CertificateListQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort);
    const scopes = this.scopeService.allowedScopeIds(actor);
    const studentOnly = !actor.permissions.includes('training.read');
    if (studentOnly && !actor.studentId) return mapPage(query, [], 0);
    const restrict = studentOnly ? { studentId: actor.studentId } : undefined;
    const result = await this.repository.list(query, scopes, restrict);
    return mapPage(query, result.rows.map((row) => mapCertificate(row)), result.totalItems);
  }

  async get(certificateId: string, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const row = await this.repository.findScoped(certificateId, scopes);
    if (!row) throw notFound();
    if (!actor.permissions.includes('training.read') && row.student_id !== actor.studentId) throw notFound();
    return mapCertificate(row);
  }

  async issue(dto: CertificateIssueDto, actor: AuthenticatedPrincipal, idempotencyKey?: string) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    try {
      const result = await this.transaction.runInTransaction(async (client) => {
        if (idempotencyKey) {
          await this.repository.acquireIdempotencyLock(client, 'certificate', idempotencyKey);
          const existing = await this.repository.findByIdempotencyKey(client, idempotencyKey);
          if (existing) {
            if (existing.student_id !== dto.studentId || existing.course_id !== dto.courseId || existing.issued_by !== actor.id) {
              throw idempotencyConflict();
            }
            const replayCourse = await this.coursesRepository.findScoped(existing.course_id, scopes, client);
            if (!replayCourse) throw notFound();
            return { row: existing, rawToken: undefined };
          }
        }

        const student = await this.studentsRepository.findById(dto.studentId, client);
        if (!student) throw notFound();
        const course = await this.coursesRepository.findScoped(dto.courseId, scopes, client);
        if (!course) throw notFound();

        // Deterministic serialization point: lock the ACTIVE enrollment for this student+course —
        // the same resource "one active certificate per enrollment" is keyed on — BEFORE
        // re-evaluating eligibility. Two concurrent issue requests for the same student+course
        // both block here; the loser only proceeds once the winner has committed, at which point
        // a fresh evaluate() sees the winner's certificate and reports CERTIFICATE_ALREADY_ISSUED.
        const enrollment = await this.eligibility.lockActiveEnrollment(client, dto.studentId, dto.courseId);
        const evaluation = await this.eligibility.evaluate(dto.studentId, dto.courseId, course.minimum_attendance_percent, client);
        if (!evaluation.eligible) throw certificateNotEligible(evaluation.unmetConditions);
        // evaluation.eligible implies ENROLLMENT_NOT_ACTIVE was not raised, so the lock above
        // necessarily found a row.
        if (!enrollment) throw certificateNotEligible(evaluation.unmetConditions);

        const { token, tokenHash } = generateVerificationToken();
        const row = await this.repository.create(client, {
          studentId: dto.studentId,
          courseId: dto.courseId,
          enrollmentId: enrollment.id,
          issuedBy: actor.id,
          tokenHash,
          idempotencyKey,
        });

        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'CERTIFICATE.ISSUE',
          entityType: 'CERTIFICATE',
          entityId: row.id,
          outcome: 'SUCCESS',
          summary: `Issued certificate ${row.certificate_number} to student ${dto.studentId} for course ${dto.courseId}`,
        });
        return { row, rawToken: token };
      });
      return mapCertificate(result.row, result.rawToken);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async revoke(certificateId: string, dto: RevokeCertificateDto, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const row = await this.transaction.runInTransaction(async (client) => {
      const current = await this.repository.findScoped(certificateId, scopes, client, true);
      if (!current) throw notFound();
      if (current.status === 'REVOKED') throw invalidState('Certificate is already revoked');

      const updated = await this.repository.revoke(client, certificateId, actor.id, dto.reason);
      if (!updated) throw invalidState('Certificate is already revoked');

      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'CERTIFICATE.REVOKE',
        entityType: 'CERTIFICATE',
        entityId: certificateId,
        outcome: 'SUCCESS',
        summary: `Revoked certificate ${current.certificate_number}: ${dto.reason}`,
        changes: [{ field: 'status', before: 'ISSUED', after: 'REVOKED' }],
      });
      return updated;
    });
    return mapCertificate(row);
  }

  /**
   * Public, unauthenticated. Any input that cannot be a valid token, and any token that does
   * not match a certificate, returns the exact same 404 — no shape, timing, or error-detail
   * difference distinguishes "malformed", "well-formed but unknown", or a token whose
   * certificate has since been deleted (it cannot: certificates are never deleted, only
   * revoked). A revoked certificate DOES verify — with status REVOKED and its revocation
   * date — per the frozen PublicCertificateVerification schema and its worked example.
   */
  async verifyPublic(rawToken: string) {
    if (!TOKEN_SHAPE.test(rawToken)) throw notFoundPublic();
    const row = await this.repository.findByTokenHash(hashVerificationToken(rawToken));
    if (!row) throw notFoundPublic();
    return mapPublicVerification(row);
  }
}

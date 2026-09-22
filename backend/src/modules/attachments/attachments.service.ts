import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extensionForContentType, sniffContentType } from '../../common/attachments/file-signature.util';
import { sanitizeFileName } from '../../common/attachments/sanitize-file-name.util';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError, ErrorDetail } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { ATTACHMENT_STORAGE } from '../../common/storage/attachment-storage';
import type { AttachmentStorage } from '../../common/storage/attachment-storage';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { JobsRepository } from '../jobs/jobs.repository';
import { signDownloadToken, verifyDownloadToken } from './download-token.util';
import { AttachmentUploadDto, JobAttachmentListQuery, JobAttachmentLinkRequest } from './dto/attachment.dto';
import { AttachmentRow, AttachmentsRepository } from './attachments.repository';
import { UploadedFileLike } from './uploaded-file';

export const ATTACHMENTS_CLOCK = Symbol('ATTACHMENTS_CLOCK');

const UNLINKED_TTL_MS = 24 * 60 * 60 * 1000;
const DOWNLOAD_AUTHORIZATION_TTL_MS = 5 * 60 * 1000;
const DOWNLOAD_ROUTE_PATH = '/api/v1/attachments/downloads';

const notFound = (): AppError => new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const attachmentNotLinkable = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.ATTACHMENT_NOT_LINKABLE, 'Attachment cannot be linked');

const badRequest = (message: string): AppError => new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const validationFailed = (field: string, code: string, message: string): AppError => {
  const detail: ErrorDetail = { field, code, message };
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED, 'Validation failed', [detail]);
};

const unsupportedMediaType = (message: string): AppError =>
  new AppError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, ErrorCode.UNSUPPORTED_MEDIA_TYPE, message);

function mapAttachment(row: AttachmentRow) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.uploaded_by,
    updatedBy: row.uploaded_by,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    purpose: row.purpose,
    status: row.status,
    ...(row.owner_type ? { ownerType: row.owner_type } : {}),
    ...(row.owner_id ? { ownerId: row.owner_id } : {}),
  };
}

function page<T>(query: { page: number; pageSize: number }, rows: T[], totalItems: number) {
  return {
    items: rows,
    page: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly repository: AttachmentsRepository,
    private readonly jobsRepository: JobsRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
    private readonly configService: ConfigService,
    @Inject(ATTACHMENT_STORAGE) private readonly storage: AttachmentStorage,
    @Inject(ATTACHMENTS_CLOCK) private readonly clock: () => number,
  ) {}

  async upload(file: UploadedFileLike | undefined, dto: AttachmentUploadDto, actor: AuthenticatedPrincipal) {
    if (!file) throw validationFailed('/file', 'REQUIRED', 'A file is required');
    if (file.size < 1) throw validationFailed('/file', 'EMPTY_FILE', 'File must not be empty');

    const sniffed = sniffContentType(file.buffer);
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
    if (!allowed.has(file.mimetype) || !sniffed || sniffed !== file.mimetype) {
      throw unsupportedMediaType('Declared content type does not match the file content, or the type is not supported');
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const fileName = sanitizeFileName(file.originalname);
    const objectStorageKey = `${randomUUID()}.${extensionForContentType(sniffed)}`;

    await this.storage.put(objectStorageKey, file.buffer, sniffed);
    try {
      const attachment = await this.transaction.runInTransaction(async (client) => {
        const row = await this.repository.insert(client, {
          uploadedBy: actor.id,
          fileName,
          contentType: sniffed,
          sizeBytes: file.size,
          sha256,
          objectStorageKey,
          purpose: dto.purpose,
        });
        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'ATTACHMENT.UPLOAD',
          entityType: 'ATTACHMENT',
          entityId: row.id,
          outcome: 'SUCCESS',
          summary: `Uploaded ${dto.purpose} attachment`,
        });
        return row;
      });
      return mapAttachment(attachment);
    } catch (error) {
      try {
        await this.storage.remove(objectStorageKey);
      } catch {
        // Best-effort cleanup only; the original error is what the caller needs to see.
      }
      throw error;
    }
  }

  async get(attachmentId: string, actor: AuthenticatedPrincipal) {
    const attachment = await this.repository.findById(attachmentId);
    if (!attachment || !(await this.canRead(attachment, actor))) throw notFound();
    return mapAttachment(attachment);
  }

  async authorizeDownload(attachmentId: string, actor: AuthenticatedPrincipal) {
    const attachment = await this.repository.findById(attachmentId);
    if (!attachment || !(await this.canRead(attachment, actor))) throw notFound();

    const expiresAt = new Date(this.clock() + DOWNLOAD_AUTHORIZATION_TTL_MS);
    const authorizationId = await this.transaction.runInTransaction(async (client) => {
      const authorization = await this.repository.insertDownloadAuthorization(client, {
        attachmentId: attachment.id,
        issuedTo: actor.id,
        expiresAt,
      });
      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'ATTACHMENT.DOWNLOAD_AUTHORIZED',
        entityType: 'ATTACHMENT',
        entityId: attachment.id,
        outcome: 'SUCCESS',
        summary: 'Issued a short-lived attachment download authorization',
      });
      return authorization.id;
    });

    // The URL below carries only the authorization row's own id plus an HMAC signature — it
    // never contains attachment.object_storage_key, a filesystem path, or any other
    // database-internal value. The signature is computed over authorizationId + issuedTo +
    // expiresAtMillis, so it cryptographically binds the URL to the caller it was issued to,
    // not merely a database column checked after the fact.
    const expiresAtMillis = expiresAt.getTime();
    const signature = signDownloadToken(authorizationId, actor.id, expiresAtMillis, this.signingSecret());
    const baseUrl = this.configService.get<string>('app.baseUrl') ?? 'http://localhost:3000';
    const url = `${baseUrl}${DOWNLOAD_ROUTE_PATH}/${authorizationId}?expires=${expiresAtMillis}&sig=${signature}`;
    return { url, expiresAt };
  }

  /**
   * Resolves a signed download URL (see authorizeDownload) to the actual bytes for the given
   * authenticated caller. Returns null for any invalid signature, tampered expiry, wrong
   * caller, unknown authorization, or expired authorization — callers must map that to 404,
   * never a more specific status, so a probing client (including a different authenticated
   * user who obtained someone else's URL) cannot distinguish which case applies.
   */
  async downloadByToken(
    authorizationId: string,
    expiresParam: string | undefined,
    signature: string | undefined,
    actor: AuthenticatedPrincipal,
  ): Promise<{ buffer: Buffer; contentType: string; fileName: string } | null> {
    const expiresAtMillis = Number(expiresParam);
    if (
      typeof signature !== 'string' ||
      !verifyDownloadToken(authorizationId, actor.id, expiresAtMillis, signature, this.signingSecret())
    ) {
      return null;
    }
    if (expiresAtMillis <= this.clock()) return null;

    const authorization = await this.repository.findDownloadAuthorization(authorizationId);
    if (!authorization || authorization.expires_at.getTime() <= this.clock()) return null;
    if (authorization.issued_to !== actor.id) return null;

    const buffer = await this.storage.get(authorization.object_storage_key);
    return { buffer, contentType: authorization.content_type, fileName: authorization.file_name };
  }

  /**
   * Never falls back to a hardcoded default: `attachments.signingSecret` is always populated
   * at boot from ATTACHMENTS_SIGNING_SECRET (preferred) or AUTH_JWT_SECRET (both validated
   * >=32 bytes by validation.schema.ts) — an empty value here means configuration is broken,
   * not that a weak default should be used.
   */
  private signingSecret(): string {
    const secret = this.configService.get<string>('attachments.signingSecret');
    if (!secret) throw new Error('Attachments signing secret is not configured');
    return secret;
  }

  async listForJob(jobId: string, query: JobAttachmentListQuery, actor: AuthenticatedPrincipal) {
    const assignedOnly = !actor.permissions.includes('jobs.read');
    const scopes = this.scopeService.allowedScopeIds(actor);
    const job = await this.jobsRepository.findScoped(jobId, scopes, undefined, false, assignedOnly ? actor.id : undefined);
    if (!job) throw notFound();
    let result;
    try {
      result = await this.repository.listForJob(jobId, query);
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_SORT') throw badRequest('Unknown sort field');
      throw error;
    }
    return page(query, result.rows.map(mapAttachment), result.totalItems);
  }

  async linkToJob(jobId: string, dto: JobAttachmentLinkRequest, actor: AuthenticatedPrincipal) {
    const assignedOnly = !actor.permissions.includes('jobs.read');
    const scopes = this.scopeService.allowedScopeIds(actor);
    await this.transaction.runInTransaction(async (client) => {
      const job = await this.jobsRepository.findScoped(jobId, scopes, client, true, assignedOnly ? actor.id : undefined);
      if (!job) throw notFound();
      try {
        await this.jobsRepository.linkAttachments(client, dto.attachmentIds, actor.id, jobId);
      } catch (error) {
        if (error instanceof Error && error.message === 'ATTACHMENT_NOT_LINKABLE') throw attachmentNotLinkable();
        throw error;
      }
      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'JOB_CARD.LINK_ATTACHMENTS',
        entityType: 'JOB_CARD',
        entityId: jobId,
        outcome: 'SUCCESS',
        summary: `Linked ${dto.attachmentIds.length} attachment(s) to job ${jobId}`,
      });
    });
    return this.listForJob(jobId, { page: 1, pageSize: 20 }, actor);
  }

  /**
   * Mirrors each owning resource's OWN read-authorization rule exactly (not a generic
   * "job access" check reused across all owner types):
   *  - JOB_CARD: jobs.read (any in-scope job) or jobs.read.assigned (own assigned job only) —
   *    same rule as JobsController's job-read routes.
   *  - JOB_APPROVAL: approvals.read, scoped by organization only — same rule as
   *    ApprovalsController/ApprovalsService.list(), which never restricts by job assignment.
   *  - QUALITY_CHECK: jobs.read, jobs.read.assigned or quality.perform — same rule as
   *    QualityController/QualityService.list(), where jobs.read.assigned holders are
   *    restricted to their own assigned job.
   *  - ASSESSMENT: training.read (any) or students.self plus actually being that student.
   */
  private async canRead(attachment: AttachmentRow, actor: AuthenticatedPrincipal): Promise<boolean> {
    if (attachment.status === 'UNLINKED') {
      const isFresh = this.clock() - attachment.created_at.getTime() < UNLINKED_TTL_MS;
      return isFresh && attachment.uploaded_by === actor.id;
    }
    const scopes = this.scopeService.allowedScopeIds(actor);
    switch (attachment.owner_type) {
      case 'JOB_CARD': {
        const hasJobsRead = actor.permissions.includes('jobs.read');
        if (!hasJobsRead && !actor.permissions.includes('jobs.read.assigned')) return false;
        return this.repository.hasJobAccess(attachment.owner_id!, scopes, hasJobsRead ? undefined : actor.id);
      }
      case 'JOB_APPROVAL':
        if (!actor.permissions.includes('approvals.read')) return false;
        return this.repository.hasApprovalJobAccess(attachment.owner_id!, scopes);
      case 'QUALITY_CHECK': {
        const unlocksAnyJob = actor.permissions.includes('jobs.read') || actor.permissions.includes('quality.perform');
        if (!unlocksAnyJob && !actor.permissions.includes('jobs.read.assigned')) return false;
        return this.repository.hasQualityCheckJobAccess(attachment.owner_id!, scopes, unlocksAnyJob ? undefined : actor.id);
      }
      case 'ASSESSMENT':
        if (actor.permissions.includes('training.read')) return true;
        if (!actor.permissions.includes('students.self')) return false;
        return this.repository.isOwnAssessment(attachment.owner_id!, actor.id);
      default:
        return false;
    }
  }
}

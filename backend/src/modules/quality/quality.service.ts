import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError, ErrorDetail } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { JobsRepository } from '../jobs/jobs.repository';
import { QualityCheckCreateRequest, QualityCheckListQuery, QualityCheckResult } from './dto/quality-check.dto';
import { QualityCheckRow, QualityRepository } from './quality.repository';

const notFound = (): AppError => new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const stageNotAllowed = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.JOB_STAGE_NOT_ALLOWED, 'Job stage does not allow this operation');

const validationFailed = (field: string, code: string, message: string): AppError => {
  const detail: ErrorDetail = { field, code, message };
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED, 'Validation failed', [detail]);
};

const attachmentNotLinkable = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.ATTACHMENT_NOT_LINKABLE, 'Attachment cannot be linked');

function badRequest(message: string): AppError {
  return new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);
}

function mapQualityCheck(row: QualityCheckRow) {
  return {
    id: row.id,
    jobId: row.job_id,
    result: row.result,
    ...(row.notes ? { notes: row.notes } : {}),
    evidenceAttachmentIds: row.evidence_attachment_ids,
    performedBy: row.performed_by,
    performedAt: row.performed_at,
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
export class QualityService {
  constructor(
    private readonly repository: QualityRepository,
    private readonly jobsRepository: JobsRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(jobId: string, query: QualityCheckListQuery, actor: AuthenticatedPrincipal) {
    if (query.sort) {
      const fields = new Set(['performedAt']);
      for (const part of query.sort.split(',')) {
        const field = part.startsWith('-') ? part.slice(1) : part;
        if (!fields.has(field)) throw badRequest('Unknown sort field');
      }
    }
    const assignedOnly = !actor.permissions.includes('jobs.read') && !actor.permissions.includes('quality.perform');
    const scopes = this.scopeService.allowedScopeIds(actor);
    const job = await this.jobsRepository.findScoped(jobId, scopes, undefined, false, assignedOnly ? actor.id : undefined);
    if (!job) throw notFound();
    const result = await this.repository.list(jobId, query);
    return page(query, result.rows.map(mapQualityCheck), result.totalItems);
  }

  async create(jobId: string, dto: QualityCheckCreateRequest, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const record = await this.transaction.runInTransaction(async (client) => {
      const job = await this.jobsRepository.findScoped(jobId, scopes, client, true);
      if (!job) throw notFound();
      if (job.stage !== 'QUALITY_CHECK') throw stageNotAllowed();
      if (dto.result === QualityCheckResult.FAILED && !dto.notes) {
        throw validationFailed('/notes', 'REQUIRED', 'Notes are required when the result is FAILED');
      }

      const qualityCheckId = await this.repository.create(client, {
        jobId, result: dto.result, notes: dto.notes, actor: actor.id,
      });
      try {
        await this.repository.linkEvidenceAttachments(client, qualityCheckId, dto.evidenceAttachmentIds ?? [], actor.id);
      } catch (error) {
        if (error instanceof Error && error.message === 'ATTACHMENT_NOT_LINKABLE') throw attachmentNotLinkable();
        throw error;
      }
      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'QUALITY_CHECK.CREATE',
        entityType: 'QUALITY_CHECK',
        entityId: qualityCheckId,
        outcome: 'SUCCESS',
        summary: `Recorded ${dto.result} quality check for job ${jobId}`,
      });
      const created = await this.repository.findById(client, qualityCheckId);
      if (!created) throw notFound();
      return created;
    });
    return mapQualityCheck(record);
  }
}

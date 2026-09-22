import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError, ErrorDetail } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { JobsRepository } from '../jobs/jobs.repository';
import { ApprovalScope, JobApprovalCreateRequest, JobApprovalDecisionRequest, JobApprovalListQuery } from './dto/approval.dto';
import { ApprovalsRepository, JobApprovalRow } from './approvals.repository';

const notFound = (): AppError => new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const invalidState = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.INVALID_STATE_TRANSITION, 'Invalid state transition');

const validationFailed = (field: string, code: string, message: string): AppError => {
  const detail: ErrorDetail = { field, code, message };
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED, 'Validation failed', [detail]);
};

const attachmentNotLinkable = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.ATTACHMENT_NOT_LINKABLE, 'Attachment cannot be linked');

function badRequest(message: string): AppError {
  return new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);
}

function mapApproval(row: JobApprovalRow) {
  return {
    id: row.id,
    jobId: row.job_id,
    scope: row.scope,
    description: row.description,
    ...(row.estimated_amount !== null ? { estimatedAmount: { amount: row.estimated_amount, currency: row.estimated_currency_code! } } : {}),
    workItemIds: row.work_item_ids,
    status: row.status,
    ...(row.method ? { method: row.method } : {}),
    ...(row.approved_by_name ? { approvedByName: row.approved_by_name } : {}),
    ...(row.decided_at ? { decidedAt: row.decided_at } : {}),
    ...(row.recorded_by ? { recordedBy: row.recorded_by } : {}),
    evidenceAttachmentIds: row.evidence_attachment_ids,
    ...(row.notes ? { notes: row.notes } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
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
export class ApprovalsService {
  constructor(
    private readonly repository: ApprovalsRepository,
    private readonly jobsRepository: JobsRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(jobId: string, query: JobApprovalListQuery, actor: AuthenticatedPrincipal) {
    if (query.sort) {
      const fields = new Set(['createdAt']);
      for (const part of query.sort.split(',')) {
        const field = part.startsWith('-') ? part.slice(1) : part;
        if (!fields.has(field)) throw badRequest('Unknown sort field');
      }
    }
    const scopes = this.scopeService.allowedScopeIds(actor);
    const job = await this.jobsRepository.findScoped(jobId, scopes);
    if (!job) throw notFound();
    const result = await this.repository.list(jobId, query);
    return page(query, result.rows.map(mapApproval), result.totalItems);
  }

  async create(jobId: string, dto: JobApprovalCreateRequest, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const approval = await this.transaction.runInTransaction(async (client) => {
      const job = await this.jobsRepository.findScoped(jobId, scopes, client);
      if (!job) throw notFound();

      const workItemIds = dto.workItemIds ?? [];
      if (dto.scope === ApprovalScope.ADDITIONAL_WORK && workItemIds.length === 0) {
        throw validationFailed('/workItemIds', 'REQUIRED', 'ADDITIONAL_WORK approvals must reference at least one additional-work item');
      }
      if (workItemIds.length > 0) {
        const valid = await this.repository.validateWorkItems(client, jobId, workItemIds, dto.scope === ApprovalScope.ADDITIONAL_WORK);
        if (!valid) {
          throw validationFailed('/workItemIds', 'WORK_ITEM_NOT_ELIGIBLE', 'Work items must belong to the job and be eligible for this approval scope');
        }
      }

      const approvalId = await this.repository.create(client, {
        jobId,
        scope: dto.scope,
        description: dto.description,
        estimatedAmount: dto.estimatedAmount?.amount,
        estimatedCurrency: dto.estimatedAmount?.currency,
        actor: actor.id,
      });
      await this.repository.linkWorkItems(client, approvalId, workItemIds);
      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'JOB_APPROVAL.CREATE',
        entityType: 'JOB_APPROVAL',
        entityId: approvalId,
        outcome: 'SUCCESS',
        summary: `Requested ${dto.scope} approval for job ${jobId}`,
      });
      const created = await this.repository.findById(client, approvalId);
      if (!created) throw notFound();
      return created;
    });
    return mapApproval(approval);
  }

  async decide(jobId: string, approvalId: string, dto: JobApprovalDecisionRequest, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const approval = await this.transaction.runInTransaction(async (client) => {
      const job = await this.jobsRepository.findScoped(jobId, scopes, client, true);
      if (!job) throw notFound();
      const current = await this.repository.findLocked(client, jobId, approvalId);
      if (!current) throw notFound();
      if (current.status !== 'PENDING') throw invalidState();

      try {
        await this.repository.linkEvidenceAttachments(client, approvalId, dto.evidenceAttachmentIds ?? [], actor.id);
      } catch (error) {
        if (error instanceof Error && error.message === 'ATTACHMENT_NOT_LINKABLE') throw attachmentNotLinkable();
        throw error;
      }

      await this.repository.decide(client, approvalId, {
        decision: dto.decision,
        method: dto.method,
        approvedByName: dto.approvedByName,
        notes: dto.notes,
        actor: actor.id,
      });
      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'JOB_APPROVAL.DECIDE',
        entityType: 'JOB_APPROVAL',
        entityId: approvalId,
        outcome: 'SUCCESS',
        summary: `${dto.decision} by ${dto.approvedByName} via ${dto.method}`,
        changes: [{ field: 'status', before: 'PENDING', after: dto.decision }],
      });
      const updated = await this.repository.findById(client, approvalId);
      if (!updated) throw notFound();
      return updated;
    });
    return mapApproval(approval);
  }
}

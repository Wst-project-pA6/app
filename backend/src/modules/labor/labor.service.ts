import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { JobsRepository } from '../jobs/jobs.repository';
import {
  LaborEntryCreateRequest,
  LaborEntryListQuery,
  LaborEntryUpdateRequest,
  VoidLaborEntryRequest,
} from './dto/labor.dto';
import { LaborEntryRow, LaborRepository } from './labor.repository';

const notFound = (): AppError => new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const stageNotAllowed = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.JOB_STAGE_NOT_ALLOWED, 'Job stage does not allow this operation');

const customerApprovalRequired = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.CUSTOMER_APPROVAL_REQUIRED, 'Customer approval is required');

const invalidState = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.INVALID_STATE_TRANSITION, 'Invalid state transition');

function badRequest(message: string): AppError {
  return new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);
}

const CORRECTABLE_STAGES = new Set(['IN_PROGRESS', 'QUALITY_CHECK']);

function formatDateOnly(value: Date | string): string {
  if (typeof value === 'string') return value;
  return value.toISOString().slice(0, 10);
}

function mapLaborEntry(row: LaborEntryRow) {
  return {
    id: row.id,
    jobId: row.job_id,
    ...(row.work_item_id ? { workItemId: row.work_item_id } : {}),
    technicianId: row.technician_id,
    workDate: formatDateOnly(row.work_date),
    durationMinutes: row.duration_minutes,
    ...(row.description ? { description: row.description } : {}),
    hourlyRate: { amount: row.hourly_rate_amount, currency: row.hourly_rate_currency },
    amount: { amount: row.amount, currency: row.amount_currency },
    status: row.status,
    ...(row.void_reason ? { voidReason: row.void_reason } : {}),
    ...(row.voided_at ? { voidedAt: row.voided_at } : {}),
    ...(row.voided_by ? { voidedBy: row.voided_by } : {}),
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
export class LaborService {
  constructor(
    private readonly repository: LaborRepository,
    private readonly jobsRepository: JobsRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(jobId: string, query: LaborEntryListQuery, actor: AuthenticatedPrincipal) {
    if (query.sort) {
      const fields = new Set(['workDate', 'createdAt']);
      for (const part of query.sort.split(',')) {
        const field = part.startsWith('-') ? part.slice(1) : part;
        if (!fields.has(field)) throw badRequest('Unknown sort field');
      }
    }
    const scopes = this.scopeService.allowedScopeIds(actor);
    const job = await this.jobsRepository.findScoped(jobId, scopes);
    if (!job) throw notFound();
    const result = await this.repository.list(jobId, query);
    return page(query, result.rows.map(mapLaborEntry), result.totalItems);
  }

  async create(jobId: string, dto: LaborEntryCreateRequest, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const entry = await this.transaction.runInTransaction(async (client) => {
      const job = await this.jobsRepository.findScoped(jobId, scopes, client, true, actor.id);
      if (!job) throw notFound();
      if (job.stage !== 'IN_PROGRESS') throw stageNotAllowed();
      if (!job.billable_work_allowed) throw customerApprovalRequired();

      if (dto.workItemId) {
        const item = await this.jobsRepository.findWorkItem(client, jobId, dto.workItemId);
        if (!item) throw notFound();
        if (item.is_additional_work) {
          const approved = await this.repository.hasApprovedAdditionalWorkApproval(client, dto.workItemId);
          if (!approved) throw customerApprovalRequired();
        }
      }

      const finance = await this.repository.findFinanceSettings(client);
      const amount = await this.repository.computeAmount(client, finance.labor_hourly_rate, dto.durationMinutes);
      const created = await this.repository.create(client, {
        jobId,
        workItemId: dto.workItemId,
        technicianId: actor.id,
        workDate: dto.workDate,
        durationMinutes: dto.durationMinutes,
        description: dto.description,
        hourlyRateAmount: finance.labor_hourly_rate,
        hourlyRateCurrency: finance.currency_code,
        amount,
        actor: actor.id,
      });
      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'LABOR_ENTRY.CREATE',
        entityType: 'LABOR_ENTRY',
        entityId: created.id,
        outcome: 'SUCCESS',
        summary: `Logged ${dto.durationMinutes} minutes on job ${jobId}`,
      });
      return created;
    });
    return mapLaborEntry(entry);
  }

  async update(jobId: string, laborEntryId: string, dto: LaborEntryUpdateRequest, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const entry = await this.transaction.runInTransaction(async (client) => {
      const job = await this.jobsRepository.findScoped(jobId, scopes, client, true, actor.id);
      if (!job) throw notFound();
      if (!CORRECTABLE_STAGES.has(job.stage)) throw stageNotAllowed();
      const current = await this.repository.findLocked(client, jobId, laborEntryId);
      if (!current) throw notFound();
      if (current.status !== 'ACTIVE') throw invalidState();

      const finalDuration = dto.durationMinutes ?? current.duration_minutes;
      const amount = await this.repository.computeAmount(client, current.hourly_rate_amount, finalDuration);
      const values: Record<string, unknown> = { duration_minutes: finalDuration, amount };
      if (dto.workDate !== undefined) values.work_date = dto.workDate;
      if (dto.description !== undefined) values.description = dto.description;

      const before = {
        workDate: formatDateOnly(current.work_date),
        durationMinutes: current.duration_minutes,
        description: current.description,
        amount: current.amount,
      };
      const updated = await this.repository.update(client, laborEntryId, values, actor.id);
      if (!updated) throw notFound();
      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'LABOR_ENTRY.CORRECT',
        entityType: 'LABOR_ENTRY',
        entityId: laborEntryId,
        outcome: 'SUCCESS',
        summary: dto.changeReason,
        changes: [{
          field: 'laborEntry',
          before,
          after: {
            workDate: formatDateOnly(updated.work_date),
            durationMinutes: updated.duration_minutes,
            description: updated.description,
            amount: updated.amount,
          },
        }],
      });
      return updated;
    });
    return mapLaborEntry(entry);
  }

  async void(jobId: string, laborEntryId: string, dto: VoidLaborEntryRequest, actor: AuthenticatedPrincipal) {
    // voidLaborEntry requires only labor.write per the frozen contract — unlike
    // createLaborEntry/updateLaborEntry it does not require assignment to the job.
    const scopes = this.scopeService.allowedScopeIds(actor);
    const entry = await this.transaction.runInTransaction(async (client) => {
      const job = await this.jobsRepository.findScoped(jobId, scopes, client, true);
      if (!job) throw notFound();
      if (!CORRECTABLE_STAGES.has(job.stage)) throw stageNotAllowed();
      const current = await this.repository.findLocked(client, jobId, laborEntryId);
      if (!current) throw notFound();
      if (current.status !== 'ACTIVE') throw invalidState();

      const updated = await this.repository.void(client, laborEntryId, dto.reason, actor.id);
      if (!updated) throw notFound();
      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'LABOR_ENTRY.VOID',
        entityType: 'LABOR_ENTRY',
        entityId: laborEntryId,
        outcome: 'SUCCESS',
        summary: dto.reason,
        changes: [{ field: 'status', before: 'ACTIVE', after: 'VOIDED' }],
      });
      return updated;
    });
    return mapLaborEntry(entry);
  }
}

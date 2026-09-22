import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError, ErrorDetail } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  CreateJobCardDto,
  CreateWorkItemDto,
  JobAssignmentDto,
  JobListQuery,
  JobStage,
  JobStageHistoryQuery,
  JobTransitionRequest,
  UpdateJobCardDto,
  UpdateWorkItemDto,
  WorkItemListQuery,
  WorkItemStatus,
} from './dto/job.dto';
import { AssignmentConflictRow, JobRow, JobsRepository, StageEventRow, WorkItemRow } from './jobs.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const versionConflict = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.VERSION_CONFLICT, 'Version conflict');

const stageNotAllowed = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.JOB_STAGE_NOT_ALLOWED, 'Job stage does not allow this operation');

const invalidState = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.INVALID_STATE_TRANSITION, 'Invalid state transition');

const forbidden = (): AppError => new AppError(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, 'Forbidden');

const jobAssignmentRequired = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.JOB_ASSIGNMENT_REQUIRED, 'Job requires a bay and technician assignment');

const customerApprovalRequired = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.CUSTOMER_APPROVAL_REQUIRED, 'Customer approval is required');

const checklistIncomplete = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.CHECKLIST_INCOMPLETE, 'All checklist items must be done or cancelled');

const qualityCheckRequired = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.QUALITY_CHECK_REQUIRED, 'A qualifying quality check is required');

const invoiceRequired = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.INVOICE_REQUIRED, 'A non-void invoice is required');

/** Allowed transitions and the exact permission required for each, per the frozen contract. */
const TRANSITION_PERMISSIONS: Record<string, string> = {
  'RECEIVED->IN_PROGRESS': 'jobs.transition.start',
  'IN_PROGRESS->QUALITY_CHECK': 'jobs.transition.submit-qc',
  'QUALITY_CHECK->IN_PROGRESS': 'quality.perform',
  'QUALITY_CHECK->READY': 'jobs.transition.ready',
  'READY->DELIVERED': 'jobs.transition.deliver',
};

const validationFailed = (field: string, code: string, message: string): AppError => {
  const detail: ErrorDetail = { field, code, message };
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED, 'Validation failed', [detail]);
};

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const UNIQUE_VIOLATION_CONSTRAINTS = new Set(['uq_job_number', 'uq_invoices_one_nonvoid_per_job']);

function mapConstraintError(error: unknown): never {
  const databaseError = error as { code?: string; constraint?: string };
  if (databaseError?.code === '23505' && databaseError.constraint && UNIQUE_VIOLATION_CONSTRAINTS.has(databaseError.constraint)) {
    throw new AppError(HttpStatus.CONFLICT, ErrorCode.DUPLICATE_RESOURCE, 'Duplicate resource');
  }
  throw error;
}

function mapJob(row: JobRow) {
  return {
    id: row.id,
    jobNumber: row.job_number,
    customerId: row.customer_id,
    customerDisplayName: row.customer_display_name,
    vehicleId: row.vehicle_id,
    vehiclePlate: row.vehicle_plate,
    organizationScopeId: row.organization_scope_id,
    complaint: row.complaint,
    serviceType: row.service_type,
    priority: row.priority,
    mileageAtIntake: row.mileage_at_intake,
    stage: row.stage,
    stageChangedAt: row.stage_changed_at,
    ...(row.bay_id ? { bayId: row.bay_id } : {}),
    ...(row.technician_id ? { technicianId: row.technician_id } : {}),
    ...(row.scheduled_start_at ? { scheduledStartAt: row.scheduled_start_at } : {}),
    expectedCompletionAt: row.expected_completion_at,
    ...(row.delivered_at ? { deliveredAt: row.delivered_at } : {}),
    approvalSummary: {
      billableWorkAllowed: row.billable_work_allowed,
      approvedScopes: row.approved_scopes,
      pendingApprovalCount: row.pending_approval_count,
    },
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
  };
}

function mapWorkItem(row: WorkItemRow) {
  return {
    id: row.id,
    jobId: row.job_id,
    description: row.description,
    status: row.status,
    isAdditionalWork: row.is_additional_work,
    ...(row.approval_id ? { approvalId: row.approval_id } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
  };
}

function mapStageEvent(row: StageEventRow) {
  return {
    id: row.id,
    jobId: row.job_id,
    ...(row.from_stage ? { fromStage: row.from_stage } : {}),
    toStage: row.to_stage,
    transitionedBy: row.transitioned_by,
    transitionedAt: row.transitioned_at,
    ...(row.reason ? { reason: row.reason } : {}),
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

function validateSort(sort: string | undefined, allowed: string[]): void {
  if (!sort) return;
  const fields = new Set(allowed);
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (!fields.has(field)) throw badRequest('Unknown sort field');
  }
}

function assignmentConflicts(rows: AssignmentConflictRow[], bayId: string, technicianId: string) {
  return rows.map((row) => ({
    conflictKey: `${row.kind}-${row.reference_id}`,
    kind: row.kind,
    overridable: false,
    overridden: false,
    message: `${row.kind.replaceAll('_', ' ')} conflicts with ${row.reference_label}`,
    ...(row.kind.startsWith('BAY_') ? { bayId } : { mentorId: technicianId }),
    conflictingReference: {
      kind: row.kind === 'BAY_JOB_CONFLICT' ? 'JOB' : 'TRAINING_SESSION',
      referenceId: row.reference_id,
      referenceLabel: row.reference_label,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    },
  }));
}

function scheduleConflict(conflicts: unknown[]): AppError {
  return new AppError(
    HttpStatus.CONFLICT,
    ErrorCode.SCHEDULE_CONFLICT,
    'Scheduling conflict',
    undefined,
    conflicts,
  );
}

@Injectable()
export class JobsService {
  constructor(
    private readonly repository: JobsRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async listTechnicians(query: { page: number; pageSize: number; q?: string; sort?: string }, actor: AuthenticatedPrincipal) {
    validateSort(query.sort, ['displayName']);
    const result = await this.repository.listTechnicians(query, this.scopeService.allowedScopeIds(actor));
    return page(query, result.rows.map((row) => ({ id: row.id, displayName: row.display_name })), result.totalItems);
  }

  async list(query: JobListQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort, ['jobNumber', 'createdAt', 'expectedCompletionAt', 'priority']);
    if (query.from && query.to && Date.parse(query.from) >= Date.parse(query.to)) {
      throw badRequest('From must be before to');
    }
    const scopes = this.scopeService.allowedScopeIds(actor);
    if (query.customerId && !(await this.repository.findAccessibleCustomer(query.customerId, scopes))) throw notFound();
    if (query.vehicleId && !(await this.repository.findAccessibleVehicle(query.vehicleId, scopes))) throw notFound();
    if (query.bayId && !(await this.repository.findAccessibleBay(query.bayId, scopes))) throw notFound();
    if (query.technicianId && !(await this.repository.findAccessibleTechnician(query.technicianId, scopes))) throw notFound();
    const assignedOnly = !actor.permissions.includes('jobs.read');
    const result = await this.repository.list(query, scopes, assignedOnly ? actor.id : undefined);
    return page(query, result.rows.map(mapJob), result.totalItems);
  }

  async create(dto: CreateJobCardDto, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    try {
      const job = await this.transaction.runInTransaction(async (client) => {
        const vehicle = await this.repository.findAccessibleVehicle(dto.vehicleId, scopes, client, true);
        if (!vehicle) throw notFound();
        if (vehicle.status !== 'ACTIVE') throw validationFailed('/vehicleId', 'VEHICLE_ARCHIVED', 'Archived vehicles cannot receive new jobs');
        if (dto.mileageAtIntake < vehicle.mileage) {
          throw validationFailed('/mileageAtIntake', 'MILEAGE_LOWER_THAN_RECORDED', 'Intake mileage may not be below the recorded mileage');
        }
        const created = await this.repository.create(client, {
          vehicleId: vehicle.id,
          customerId: vehicle.customer_id,
          organizationScopeId: vehicle.organization_scope_id,
          complaint: dto.complaint,
          serviceType: dto.serviceType,
          priority: dto.priority,
          mileageAtIntake: dto.mileageAtIntake,
          expectedCompletionAt: dto.expectedCompletionAt,
          actor: actor.id,
        });
        await this.repository.createStageEvent(client, created.id, actor.id);
        for (const item of dto.workItems ?? []) {
          await this.repository.createWorkItem(client, {
            jobId: created.id,
            description: item.description,
            isAdditionalWork: item.isAdditionalWork ?? false,
            actor: actor.id,
          });
        }
        if (dto.attachmentIds?.length) {
          try {
            await this.repository.linkAttachments(client, dto.attachmentIds, actor.id, created.id);
          } catch (error) {
            if (error instanceof Error && error.message === 'ATTACHMENT_NOT_LINKABLE') {
              throw new AppError(HttpStatus.CONFLICT, ErrorCode.ATTACHMENT_NOT_LINKABLE, 'Attachment cannot be linked');
            }
            throw error;
          }
        }
        return this.repository.findById(client, created.id);
      });
      if (!job) throw notFound();
      return mapJob(job);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async get(jobId: string, actor: AuthenticatedPrincipal) {
    const assignedOnly = !actor.permissions.includes('jobs.read');
    const job = await this.repository.findScoped(
      jobId,
      this.scopeService.allowedScopeIds(actor),
      undefined,
      false,
      assignedOnly ? actor.id : undefined,
    );
    if (!job) throw notFound();
    return mapJob(job);
  }

  async update(jobId: string, dto: UpdateJobCardDto, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    try {
      const job = await this.transaction.runInTransaction(async (client) => {
        const current = await this.repository.findScoped(jobId, scopes, client, true);
        if (!current) throw notFound();
        if (current.stage === JobStage.DELIVERED) throw stageNotAllowed();
        if (dto.expectedCompletionAt && current.scheduled_start_at && Date.parse(dto.expectedCompletionAt) <= current.scheduled_start_at.getTime()) {
          throw validationFailed('/expectedCompletionAt', 'INVALID_TIME_WINDOW', 'Expected completion must be after the scheduled start');
        }
        const values: Record<string, unknown> = {};
        if (dto.complaint !== undefined) values.complaint = dto.complaint;
        if (dto.priority !== undefined) values.priority = dto.priority;
        if (dto.serviceType !== undefined) values.service_type = dto.serviceType;
        if (dto.expectedCompletionAt !== undefined) values.expected_completion_at = dto.expectedCompletionAt;
        if (Object.keys(values).length === 0) throw validationFailed('/', 'REQUIRED', 'At least one job field is required');
        const updated = await this.repository.update(client, jobId, dto.version, values, actor.id);
        if (!updated) throw versionConflict();
        return updated;
      });
      return mapJob(job);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async assign(jobId: string, dto: JobAssignmentDto, actor: AuthenticatedPrincipal) {
    if (Date.parse(dto.scheduledStartAt) >= Date.parse(dto.expectedCompletionAt)) {
      throw validationFailed('/expectedCompletionAt', 'INVALID_TIME_WINDOW', 'Expected completion must be after scheduled start');
    }
    const scopes = this.scopeService.allowedScopeIds(actor);
    try {
      const job = await this.transaction.runInTransaction(async (client) => {
        // Acquire locks in a stable order: job, bay, technician. This prevents
        // concurrent replacement assignments from acquiring resources cyclically.
        const current = await this.repository.findScoped(jobId, scopes, client, true);
        if (!current) throw notFound();
        const bay = await this.repository.findAccessibleBay(dto.bayId, scopes, client, true);
        if (!bay) throw notFound();
        const technician = await this.repository.findAssignableTechnician(dto.technicianId, current.organization_scope_id, client, true);
        if (!technician) throw validationFailed('/technicianId', 'TECHNICIAN_NOT_ELIGIBLE', 'Technician is not active, eligible, or in scope');
        if (current.stage === JobStage.DELIVERED) throw stageNotAllowed();
        if (current.version !== dto.version) throw versionConflict();
        if (bay.status !== 'ACTIVE') {
          throw scheduleConflict([{
            conflictKey: `BAY_UNAVAILABLE-${bay.id}`,
            kind: 'BAY_UNAVAILABLE',
            overridable: false,
            overridden: false,
            message: 'Bay is not available',
            bayId: bay.id,
          }]);
        }
        const conflicts = await this.repository.findAssignmentConflicts(
          client,
          jobId,
          dto.bayId,
          dto.technicianId,
          dto.scheduledStartAt,
          dto.expectedCompletionAt,
        );
        if (conflicts.length) throw scheduleConflict(assignmentConflicts(conflicts, dto.bayId, dto.technicianId));
        const updated = await this.repository.assign(client, jobId, dto.version, {
          bayId: dto.bayId,
          technicianId: dto.technicianId,
          scheduledStartAt: dto.scheduledStartAt,
          expectedCompletionAt: dto.expectedCompletionAt,
          actor: actor.id,
        });
        if (!updated) throw versionConflict();
        return updated;
      });
      return mapJob(job);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async listWorkItems(jobId: string, query: WorkItemListQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort, ['createdAt']);
    const assignedOnly = !actor.permissions.includes('jobs.read');
    const job = await this.repository.findScoped(jobId, this.scopeService.allowedScopeIds(actor), undefined, false, assignedOnly ? actor.id : undefined);
    if (!job) throw notFound();
    const result = await this.repository.listWorkItems(jobId, query);
    return page(query, result.rows.map(mapWorkItem), result.totalItems);
  }

  async createWorkItem(jobId: string, dto: CreateWorkItemDto, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const item = await this.transaction.runInTransaction(async (client) => {
      const job = await this.repository.findScoped(jobId, scopes, client, true);
      if (!job) throw notFound();
      if (job.stage !== JobStage.RECEIVED && job.stage !== JobStage.IN_PROGRESS) throw invalidState();
      return this.repository.createWorkItem(client, {
        jobId,
        description: dto.description,
        isAdditionalWork: dto.isAdditionalWork ?? false,
        actor: actor.id,
      });
    });
    return mapWorkItem(item);
  }

  async updateWorkItem(jobId: string, workItemId: string, dto: UpdateWorkItemDto, actor: AuthenticatedPrincipal) {
    const canManage = actor.permissions.includes('jobs.update');
    const canLabor = actor.permissions.includes('labor.write');
    const scopes = this.scopeService.allowedScopeIds(actor);
    const item = await this.transaction.runInTransaction(async (client) => {
      const job = await this.repository.findScoped(jobId, scopes, client, true, canManage ? undefined : actor.id);
      if (!job) throw notFound();
      const current = await this.repository.findWorkItem(client, jobId, workItemId, true);
      if (!current) throw notFound();
      if (dto.description !== undefined && !canManage) throw new AppError(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, 'Forbidden');
      if (dto.status === WorkItemStatus.CANCELLED && !canManage) {
        throw new AppError(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, 'Forbidden');
      }
      if (dto.status !== undefined && dto.status !== WorkItemStatus.CANCELLED && !canLabor) {
        throw new AppError(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, 'Forbidden');
      }
      if (dto.status !== undefined) {
        if (job.stage !== JobStage.IN_PROGRESS) throw invalidState();
        if (current.status !== WorkItemStatus.PENDING) throw invalidState();
      }
      if (job.stage === JobStage.DELIVERED) throw stageNotAllowed();
      const values: Record<string, unknown> = {};
      if (dto.description !== undefined) values.description = dto.description;
      if (dto.status !== undefined) {
        values.status = dto.status;
        values.completed_at = dto.status === WorkItemStatus.DONE ? new Date() : null;
      }
      if (Object.keys(values).length === 0) throw validationFailed('/', 'REQUIRED', 'At least one work item field is required');
      const updated = await this.repository.updateWorkItem(client, workItemId, values, actor.id);
      if (!updated) throw notFound();
      return updated;
    });
    return mapWorkItem(item);
  }

  async transition(jobId: string, dto: JobTransitionRequest, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const assignedOnly = !actor.permissions.includes('jobs.read');
    try {
      const job = await this.transaction.runInTransaction(async (client) => {
        const current = await this.repository.findScoped(jobId, scopes, client, true, assignedOnly ? actor.id : undefined);
        if (!current) throw notFound();
        if (current.stage !== dto.expectedFromStage) throw versionConflict();
        const key = `${current.stage}->${dto.toStage}`;
        const permission = TRANSITION_PERMISSIONS[key];
        if (!permission) throw invalidState();
        if (!actor.permissions.includes(permission)) throw forbidden();

        if (dto.toStage === JobStage.IN_PROGRESS && current.stage === JobStage.RECEIVED) {
          if (!current.bay_id || !current.technician_id) throw jobAssignmentRequired();
          if (!current.billable_work_allowed) throw customerApprovalRequired();
        } else if (dto.toStage === JobStage.IN_PROGRESS && current.stage === JobStage.QUALITY_CHECK) {
          if (!dto.reason) throw validationFailed('/reason', 'REQUIRED', 'A reason is required when returning to IN_PROGRESS');
          const latestQc = await this.repository.findLatestQualityCheck(client, jobId);
          if (!latestQc || latestQc.result !== 'FAILED') throw qualityCheckRequired();
        } else if (dto.toStage === JobStage.QUALITY_CHECK) {
          const incomplete = await this.repository.countIncompleteWorkItems(client, jobId);
          if (incomplete > 0) throw checklistIncomplete();
        } else if (dto.toStage === JobStage.READY) {
          const latestQc = await this.repository.findLatestQualityCheck(client, jobId);
          if (!latestQc || latestQc.result !== 'PASSED') throw qualityCheckRequired();
        } else if (dto.toStage === JobStage.DELIVERED) {
          const hasInvoice = await this.repository.hasNonVoidInvoice(client, jobId);
          if (!hasInvoice) throw invoiceRequired();
        }

        const updated = await this.repository.transitionStage(
          client, jobId, current.version, dto.toStage, actor.id, dto.toStage === JobStage.DELIVERED,
        );
        if (!updated) throw versionConflict();
        await this.repository.recordTransition(client, jobId, current.stage, dto.toStage, actor.id, dto.reason);
        if (dto.toStage === JobStage.READY) {
          await this.repository.generateDraftInvoice(client, jobId, current.customer_id, actor.id);
        }
        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'JOB_CARD.TRANSITION',
          entityType: 'JOB_CARD',
          entityId: jobId,
          outcome: 'SUCCESS',
          summary: `${current.stage} -> ${dto.toStage}`,
          changes: [{ field: 'stage', before: current.stage, after: dto.toStage }],
        });
        return updated;
      });
      return mapJob(job);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async listStageHistory(jobId: string, query: JobStageHistoryQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort, ['transitionedAt']);
    const assignedOnly = !actor.permissions.includes('jobs.read');
    const job = await this.repository.findScoped(jobId, this.scopeService.allowedScopeIds(actor), undefined, false, assignedOnly ? actor.id : undefined);
    if (!job) throw notFound();
    const result = await this.repository.listStageEvents(jobId, query);
    return page(query, result.rows.map(mapStageEvent), result.totalItems);
  }
}

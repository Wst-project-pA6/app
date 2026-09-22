import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError, ErrorDetail } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { JobsRepository } from '../jobs/jobs.repository';
import { PartIssueCreateRequest, PartIssueListQuery, PartIssueReversalRequest, PartIssueStatus } from './dto/part-issue.dto';
import { PartStatus } from './dto/part.dto';
import { PartReservationStatus } from './dto/part-reservation.dto';
import { PartIssueReversalRow, PartIssueRow, PartIssuesRepository } from './part-issues.repository';
import { PartReservationsRepository } from './part-reservations.repository';
import { PartsRepository } from './parts.repository';
import { StoreStatus } from './dto/store.dto';
import { StoresRepository } from './stores.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const jobStageNotAllowed = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.JOB_STAGE_NOT_ALLOWED, 'Job stage does not allow this operation');

const customerApprovalRequired = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.CUSTOMER_APPROVAL_REQUIRED, 'Customer approval is required');

const reservationInvalid = (message: string): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.RESERVATION_INVALID, message);

const reversalExceedsIssued = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.REVERSAL_EXCEEDS_ISSUED, 'Reversal quantity exceeds remaining issued quantity');

const idempotencyConflict = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.IDEMPOTENCY_CONFLICT, 'Idempotency-Key was already used for a different request');

function insufficientStock(available: number, requested: number): AppError {
  const details: ErrorDetail[] = [
    {
      field: '/quantity',
      code: 'INSUFFICIENT_STOCK',
      message: `Only ${available} unit(s) available.`,
      params: { available: String(available), requested: String(requested) },
    },
  ];
  return new AppError(
    HttpStatus.CONFLICT,
    ErrorCode.INSUFFICIENT_STOCK,
    'Requested quantity exceeds available stock.',
    details,
  );
}

function validateSort(sort: string | undefined, allowedFields: Set<string>): void {
  if (!sort) return;
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (!allowedFields.has(field)) {
      throw badRequest('Unknown sort field');
    }
  }
}

function mapPartIssue(row: PartIssueRow, canReadCost: boolean) {
  return {
    id: row.id,
    jobId: row.job_id,
    partId: row.part_id,
    partSku: row.part_sku,
    storeId: row.store_id,
    ...(row.work_item_id ? { workItemId: row.work_item_id } : {}),
    ...(row.reservation_id ? { reservationId: row.reservation_id } : {}),
    quantity: Number(row.quantity),
    reversedQuantity: Number(row.reversed_quantity),
    unitPrice: { amount: row.unit_price_amount, currency: row.unit_price_currency },
    ...(canReadCost && row.unit_cost_amount !== null && row.unit_cost_currency !== null
      ? { unitCost: { amount: row.unit_cost_amount, currency: row.unit_cost_currency } }
      : {}),
    lineTotal: { amount: row.line_total_amount, currency: row.line_total_currency },
    status: row.status,
    stockMovementId: row.stock_movement_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
  };
}

function mapReversal(row: PartIssueReversalRow, partIssueStatus: PartIssueStatus) {
  return {
    id: row.id,
    partIssueId: row.part_issue_id,
    quantity: Number(row.quantity),
    reason: row.reason,
    reversedBy: row.reversed_by,
    reversedAt: row.reversed_at,
    stockMovementId: row.stock_movement_id,
    partIssueStatus,
  };
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

function mapConstraintError(error: unknown): never {
  if (error instanceof AppError) {
    throw error;
  }
  const dbError = error as { code?: string; constraint?: string };
  if (dbError?.code === '23514' && dbError.constraint === 'chk_reserved_lte_on_hand') {
    throw insufficientStock(0, 0);
  }
  if (
    dbError?.code === '23505' &&
    (dbError.constraint === 'uq_part_issues_idempotency' || dbError.constraint === 'uq_reversals_idempotency')
  ) {
    throw idempotencyConflict();
  }
  throw error;
}

function issueReplayMatches(
  existing: PartIssueRow,
  jobId: string,
  dto: PartIssueCreateRequest,
  actorId: string,
): boolean {
  return (
    existing.job_id === jobId &&
    existing.created_by === actorId &&
    existing.part_id === dto.partId &&
    existing.store_id === dto.storeId &&
    Number(existing.quantity) === dto.quantity &&
    (existing.work_item_id ?? null) === (dto.workItemId ?? null) &&
    (existing.reservation_id ?? null) === (dto.reservationId ?? null)
  );
}

function reversalReplayMatches(
  existing: PartIssueReversalRow,
  partIssueId: string,
  dto: PartIssueReversalRequest,
  actorId: string,
): boolean {
  return (
    existing.part_issue_id === partIssueId &&
    existing.reversed_by === actorId &&
    Number(existing.quantity) === dto.quantity &&
    existing.reason === dto.reason
  );
}

const ISSUE_SORT_ALLOWED = new Set(['createdAt']);

@Injectable()
export class PartIssuesService {
  constructor(
    private readonly repository: PartIssuesRepository,
    private readonly reservationsRepository: PartReservationsRepository,
    private readonly jobsRepository: JobsRepository,
    private readonly storesRepository: StoresRepository,
    private readonly partsRepository: PartsRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(jobId: string, query: PartIssueListQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort, ISSUE_SORT_ALLOWED);
    const scopes = this.scopeService.allowedScopeIds(actor);
    const assignedOnly = actor.roles.includes('TECHNICIAN');

    const job = await this.jobsRepository.findScoped(
      jobId,
      scopes,
      undefined,
      false,
      assignedOnly ? actor.id : undefined,
    );
    if (!job) {
      throw notFound();
    }

    const result = await this.repository.listByJobId(jobId, query);
    const canReadCost = actor.permissions.includes('inventory.cost.read');
    return mapPage(
      query,
      result.rows.map((row) => mapPartIssue(row, canReadCost)),
      result.totalItems,
    );
  }

  async issue(
    jobId: string,
    dto: PartIssueCreateRequest,
    actor: AuthenticatedPrincipal,
    idempotencyKey: string | undefined,
  ) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const canReadCost = actor.permissions.includes('inventory.cost.read');

    try {
      const created = await this.transaction.runInTransaction(async (client) => {
        if (idempotencyKey) {
          await this.repository.acquireIdempotencyLock(client, 'part_issue', idempotencyKey);
          const existing = await this.repository.findByIdempotencyKey(client, idempotencyKey);
          if (existing) {
            // Authorize and scope-check before returning a replay.
            const authorizedJob = await this.jobsRepository.findScoped(jobId, scopes, client, false, actor.id);
            if (!authorizedJob || existing.job_id !== jobId) {
              throw notFound();
            }
            if (!issueReplayMatches(existing, jobId, dto, actor.id)) {
              throw idempotencyConflict();
            }
            return existing;
          }
        }

        // 1. Lock the job; issuing always requires assignment to the job.
        const job = await this.jobsRepository.findScoped(jobId, scopes, client, true, actor.id);
        if (!job) {
          throw notFound();
        }

        // 2. Job must be IN_PROGRESS
        if (job.stage !== 'IN_PROGRESS') {
          throw jobStageNotAllowed();
        }

        // 3. Require an APPROVED INITIAL_WORK approval
        if (!job.billable_work_allowed) {
          throw customerApprovalRequired();
        }

        // 4. Validate work item, if supplied
        if (dto.workItemId) {
          const item = await this.jobsRepository.findWorkItem(client, jobId, dto.workItemId);
          if (!item) {
            throw notFound();
          }
          if (item.is_additional_work) {
            const approved = await this.repository.hasApprovedAdditionalWorkApproval(client, dto.workItemId);
            if (!approved) {
              throw customerApprovalRequired();
            }
          }
        }

        // 5. Validate the part is ACTIVE
        const part = await this.partsRepository.findById(client, dto.partId, true);
        if (!part || part.status !== PartStatus.ACTIVE) {
          throw notFound();
        }

        // 6. Validate the store is ACTIVE and in the caller's active organization scope
        const store = await this.storesRepository.findScoped(dto.storeId, scopes, client, true);
        if (!store || store.status !== StoreStatus.ACTIVE) {
          throw notFound();
        }

        // 7. Lock the reservation before the balance, if supplied
        let reservation = null;
        if (dto.reservationId) {
          reservation = await this.reservationsRepository.lockReservation(client, dto.reservationId);
          if (
            !reservation ||
            reservation.job_id !== jobId ||
            reservation.part_id !== dto.partId ||
            reservation.store_id !== dto.storeId
          ) {
            throw notFound();
          }
          if (reservation.status !== PartReservationStatus.ACTIVE) {
            throw reservationInvalid('Reservation is not active');
          }
        }

        // 8. Lock the stock balance FOR UPDATE
        const balance = await this.repository.lockBalanceForIssue(client, dto.storeId, dto.partId);
        if (!balance) {
          throw insufficientStock(0, dto.quantity);
        }

        const onHand = Number(balance.on_hand);
        const reserved = Number(balance.reserved);
        const remainingReservation = reservation
          ? Number(reservation.quantity) - Number(reservation.consumed_quantity)
          : 0;
        const usable = onHand - reserved + (reservation ? remainingReservation : 0);

        if (dto.quantity > usable) {
          throw insufficientStock(usable, dto.quantity);
        }

        const consumed = reservation ? Math.min(dto.quantity, remainingReservation) : 0;

        // 9. Decrease on_hand by the full quantity; decrease reserved only by the consumed reservation amount
        const updatedBalance = await this.repository.updateBalanceForIssue(
          client,
          dto.storeId,
          dto.partId,
          -dto.quantity,
          consumed === 0 ? 0 : -consumed,
        );

        // 10. Consume the reservation
        if (reservation && consumed > 0) {
          await this.reservationsRepository.consumeReservation(client, reservation.id, consumed, actor.id);
        }

        // 11. Point-in-time unit cost snapshot from the locked balance
        const unitCostAmount = balance.average_cost_currency ? balance.average_cost_amount : null;
        const unitCostCurrency = balance.average_cost_currency ?? null;

        // 12. Append the immutable ISSUE stock movement (part_issue_id stays NULL; the FK is circular)
        const movementId = await this.repository.createIssueMovement(client, {
          storeId: dto.storeId,
          partId: dto.partId,
          onHandDelta: -dto.quantity,
          reservedDelta: consumed === 0 ? 0 : -consumed,
          onHandAfter: Number(updatedBalance.on_hand),
          reservedAfter: Number(updatedBalance.reserved),
          unitCostAmount,
          unitCostCurrency,
          jobId,
          actorId: actor.id,
          reason: `Issued to job ${job.job_number}`,
        });

        // 13. Line total via PostgreSQL NUMERIC arithmetic, never JavaScript floating point
        const lineTotal = await this.repository.computeLineTotal(client, part.selling_price_amount, dto.quantity);

        // 14. Create the PartIssue snapshotting SKU, price and cost
        const createdIssue = await this.repository.createPartIssue(client, {
          jobId,
          partId: dto.partId,
          partSku: part.sku,
          storeId: dto.storeId,
          workItemId: dto.workItemId,
          reservationId: dto.reservationId,
          quantity: dto.quantity,
          unitPriceAmount: part.selling_price_amount,
          unitPriceCurrency: part.selling_price_currency,
          unitCostAmount,
          unitCostCurrency,
          lineTotalAmount: lineTotal,
          lineTotalCurrency: part.selling_price_currency,
          stockMovementId: movementId,
          idempotencyKey,
          actorId: actor.id,
        });

        // 15. Audit event, committed atomically with everything above
        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'PART_ISSUE.CREATE',
          entityType: 'PART_ISSUE',
          entityId: createdIssue.id,
          outcome: 'SUCCESS',
          summary: `Issued ${dto.quantity} of part ${dto.partId} to job ${job.job_number}`,
        });

        return createdIssue;
      });

      return mapPartIssue(created, canReadCost);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async reverse(
    jobId: string,
    partIssueId: string,
    dto: PartIssueReversalRequest,
    actor: AuthenticatedPrincipal,
    idempotencyKey: string | undefined,
  ) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const assignedOnly = actor.roles.includes('TECHNICIAN');

    try {
      const result = await this.transaction.runInTransaction(async (client) => {
        if (idempotencyKey) {
          await this.repository.acquireIdempotencyLock(client, 'part_issue_reversal', idempotencyKey);
          const existing = await this.repository.findReversalByIdempotencyKey(client, idempotencyKey);
          if (existing) {
            // Authorize and scope-check before returning a replay.
            const authorizedJob = await this.jobsRepository.findScoped(
              jobId,
              scopes,
              client,
              false,
              assignedOnly ? actor.id : undefined,
            );
            if (!authorizedJob) {
              throw notFound();
            }
            const issueRow = await this.repository.findIssueById(client, existing.part_issue_id);
            if (!issueRow || issueRow.job_id !== jobId || existing.part_issue_id !== partIssueId) {
              throw notFound();
            }
            if (!reversalReplayMatches(existing, partIssueId, dto, actor.id)) {
              throw idempotencyConflict();
            }
            return { reversal: existing, issueStatus: issueRow.status };
          }
        }

        // 1. Lock the job
        const job = await this.jobsRepository.findScoped(
          jobId,
          scopes,
          client,
          true,
          assignedOnly ? actor.id : undefined,
        );
        if (!job) {
          throw notFound();
        }

        // 2. Allowed only while IN_PROGRESS or QUALITY_CHECK
        if (job.stage !== 'IN_PROGRESS' && job.stage !== 'QUALITY_CHECK') {
          throw jobStageNotAllowed();
        }

        // 3. Lock the part issue; cross-job issues are concealed as 404
        const issue = await this.repository.lockIssue(client, partIssueId);
        if (!issue || issue.job_id !== jobId) {
          throw notFound();
        }

        // 4. Lock the stock balance
        const balance = await this.repository.lockBalanceForIssue(client, issue.store_id, issue.part_id);
        if (!balance) {
          throw notFound();
        }

        // 5. Remaining reversible quantity
        const remaining = Number(issue.quantity) - Number(issue.reversed_quantity);
        if (dto.quantity > remaining) {
          throw reversalExceedsIssued();
        }

        // 6. Increase on_hand by the reversal quantity; reserved is never touched
        const updatedBalance = await this.repository.updateBalanceForIssue(
          client,
          issue.store_id,
          issue.part_id,
          dto.quantity,
          0,
        );

        // 7. Append the immutable ISSUE_REVERSAL movement, referencing the original part issue
        const movementId = await this.repository.createReversalMovement(client, {
          storeId: issue.store_id,
          partId: issue.part_id,
          quantity: dto.quantity,
          onHandAfter: Number(updatedBalance.on_hand),
          reservedAfter: Number(updatedBalance.reserved),
          unitCostAmount: issue.unit_cost_amount,
          unitCostCurrency: issue.unit_cost_currency,
          jobId,
          partIssueId: issue.id,
          actorId: actor.id,
          reason: dto.reason,
        });

        // 8. Insert the append-only reversal record
        const reversal = await this.repository.createReversal(client, {
          partIssueId: issue.id,
          quantity: dto.quantity,
          reason: dto.reason,
          reversedBy: actor.id,
          stockMovementId: movementId,
          idempotencyKey,
        });

        // 9. Update the issue's reversed_quantity and status; the original ISSUE movement is never touched
        const newReversedQuantity = Number(issue.reversed_quantity) + dto.quantity;
        const newStatus =
          newReversedQuantity === 0
            ? PartIssueStatus.ISSUED
            : newReversedQuantity === Number(issue.quantity)
              ? PartIssueStatus.REVERSED
              : PartIssueStatus.PARTIALLY_REVERSED;
        const updatedIssue = await this.repository.applyReversal(client, issue.id, dto.quantity, newStatus, actor.id);

        // 10. Audit event, committed atomically with everything above
        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'PART_ISSUE.REVERSE',
          entityType: 'PART_ISSUE',
          entityId: issue.id,
          outcome: 'SUCCESS',
          summary: dto.reason,
        });

        return { reversal, issueStatus: updatedIssue.status };
      });

      return mapReversal(result.reversal, result.issueStatus);
    } catch (error) {
      return mapConstraintError(error);
    }
  }
}

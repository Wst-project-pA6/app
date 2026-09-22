import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  StockAdjustmentCreateRequest,
  StockAdjustmentDecision,
  StockAdjustmentDecisionRequest,
  StockAdjustmentListQuery,
  StockAdjustmentStatus,
} from './dto/stock-adjustment.dto';
import { PartStatus } from './dto/part.dto';
import { StoreStatus } from './dto/store.dto';
import { PartsRepository } from './parts.repository';
import {
  StockAdjustmentRow,
  StockAdjustmentsRepository,
} from './stock-adjustments.repository';
import { StoresRepository } from './stores.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const invalidStateTransition = (message: string): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.INVALID_STATE_TRANSITION, message);

const separationOfDuties = (message: string): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.SEPARATION_OF_DUTIES_VIOLATION, message);

const insufficientStock = (
  message = 'Adjustment would cause on-hand stock to fall below reserved or zero',
): AppError => new AppError(HttpStatus.CONFLICT, ErrorCode.INSUFFICIENT_STOCK, message);

const idempotencyConflict = (): AppError =>
  new AppError(
    HttpStatus.CONFLICT,
    ErrorCode.IDEMPOTENCY_CONFLICT,
    'Idempotency-Key was already used for a different request',
  );

function validateSort(sort: string | undefined, allowedFields: Set<string>): void {
  if (!sort) return;
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (!allowedFields.has(field)) {
      throw badRequest('Unknown sort field');
    }
  }
}

function mapStockAdjustment(row: StockAdjustmentRow) {
  return {
    id: row.id,
    storeId: row.store_id,
    partId: row.part_id,
    quantityDelta: Number(row.quantity_delta),
    reasonCode: row.reason_code,
    ...(row.note !== null && row.note !== undefined ? { note: row.note } : {}),
    status: row.status,
    ...(row.decided_by ? { decidedBy: row.decided_by } : {}),
    ...(row.decided_at ? { decidedAt: row.decided_at } : {}),
    ...(row.decision_reason ? { decisionReason: row.decision_reason } : {}),
    ...(row.stock_movement_id ? { stockMovementId: row.stock_movement_id } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.requested_by,
    updatedBy: row.decided_by ?? row.requested_by,
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

function adjustmentReplayMatches(
  existing: StockAdjustmentRow,
  dto: StockAdjustmentCreateRequest,
  actorId: string,
): boolean {
  return (
    existing.requested_by === actorId &&
    existing.store_id === dto.storeId &&
    existing.part_id === dto.partId &&
    Number(existing.quantity_delta) === dto.quantityDelta &&
    existing.reason_code === dto.reasonCode &&
    (existing.note ?? null) === (dto.note ?? null)
  );
}

function buildMovementReason(
  reasonCode: string,
  note?: string | null,
  decisionReason?: string | null,
): string {
  const parts: string[] = [`Stock adjustment (${reasonCode})`];
  if (decisionReason) {
    parts.push(`Decision: ${decisionReason}`);
  } else if (note) {
    parts.push(`Note: ${note}`);
  }
  const combined = parts.join(' - ');
  return combined.length > 500 ? combined.slice(0, 500) : combined;
}

function mapConstraintError(error: unknown): never {
  if (error instanceof AppError) {
    throw error;
  }
  const dbError = error as { code?: string; constraint?: string };
  if (dbError?.code === '23514' && dbError.constraint === 'chk_adjustment_separation_of_duties') {
    throw separationOfDuties('Requester cannot decide their own stock adjustment');
  }
  if (dbError?.code === '23514' && dbError.constraint === 'chk_adjustment_decision') {
    throw invalidStateTransition('Stock adjustment state transition not allowed');
  }
  if (
    dbError?.code === '23514' &&
    (dbError.constraint === 'chk_reserved_lte_on_hand' ||
      dbError.constraint === 'chk_reserved_after_lte_on_hand_after')
  ) {
    throw insufficientStock();
  }
  if (dbError?.code === '23505' && dbError.constraint === 'uq_adjustments_idempotency') {
    throw idempotencyConflict();
  }
  throw error;
}

const ADJUSTMENT_SORT_ALLOWED = new Set(['createdAt']);

@Injectable()
export class StockAdjustmentsService {
  constructor(
    private readonly repository: StockAdjustmentsRepository,
    private readonly storesRepository: StoresRepository,
    private readonly partsRepository: PartsRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(query: StockAdjustmentListQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort, ADJUSTMENT_SORT_ALLOWED);
    const scopes = this.scopeService.allowedScopeIds(actor);

    const result = await this.repository.list(query, scopes);
    return mapPage(query, result.rows.map(mapStockAdjustment), result.totalItems);
  }

  async create(
    dto: StockAdjustmentCreateRequest,
    actor: AuthenticatedPrincipal,
    idempotencyKey?: string,
  ) {
    const scopes = this.scopeService.allowedScopeIds(actor);

    try {
      const created = await this.transaction.runInTransaction(async (client) => {
        if (idempotencyKey) {
          await this.repository.acquireIdempotencyLock(client, 'stock_adjustment', idempotencyKey);
          const existing = await this.repository.findByIdempotencyKey(client, idempotencyKey);
          if (existing) {
            const store = await this.storesRepository.findScoped(
              existing.store_id,
              scopes,
              client,
              false,
            );
            if (!store) {
              throw notFound();
            }
            if (!adjustmentReplayMatches(existing, dto, actor.id)) {
              throw idempotencyConflict();
            }
            return existing;
          }
        }

        const store = await this.storesRepository.findScoped(dto.storeId, scopes, client, false);
        if (!store || store.status !== StoreStatus.ACTIVE) {
          throw notFound();
        }

        const part = await this.partsRepository.findById(client, dto.partId);
        if (!part || part.status !== PartStatus.ACTIVE) {
          throw notFound();
        }

        const adjustment = await this.repository.create(client, {
          storeId: dto.storeId,
          partId: dto.partId,
          quantityDelta: dto.quantityDelta,
          reasonCode: dto.reasonCode,
          note: dto.note,
          requestedBy: actor.id,
          idempotencyKey,
        });

        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'STOCK_ADJUSTMENT.CREATE',
          entityType: 'STOCK_ADJUSTMENT',
          entityId: adjustment.id,
          outcome: 'SUCCESS',
          summary: `Requested stock adjustment of ${dto.quantityDelta} for part ${dto.partId} in store ${dto.storeId} (${dto.reasonCode})`,
        });

        return adjustment;
      });

      return mapStockAdjustment(created);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async decide(
    adjustmentId: string,
    dto: StockAdjustmentDecisionRequest,
    actor: AuthenticatedPrincipal,
  ) {
    const scopes = this.scopeService.allowedScopeIds(actor);

    try {
      const decided = await this.transaction.runInTransaction(async (client) => {
        // 1. Lock the scoped stock_adjustment FOR UPDATE
        const adjustment = await this.repository.lockAdjustment(client, adjustmentId, scopes);
        if (!adjustment) {
          throw notFound();
        }

        // 2. Validate pending state
        if (adjustment.status !== StockAdjustmentStatus.PENDING_APPROVAL) {
          throw invalidStateTransition('Stock adjustment is already decided');
        }

        // 3. Separation of duties: approver must differ from requester
        if (adjustment.requested_by === actor.id) {
          throw separationOfDuties('Requester cannot decide their own stock adjustment');
        }

        if (dto.decision === StockAdjustmentDecision.REJECTED) {
          const rejected = await this.repository.applyDecision(client, {
            adjustmentId,
            status: StockAdjustmentStatus.REJECTED,
            decidedBy: actor.id,
            decisionReason: dto.reason,
          });

          await this.audit.record(client, {
            actorUserId: actor.id,
            actorRoles: actor.roles,
            action: 'STOCK_ADJUSTMENT.REJECT',
            entityType: 'STOCK_ADJUSTMENT',
            entityId: adjustment.id,
            outcome: 'SUCCESS',
            summary: `Rejected stock adjustment for part ${adjustment.part_id} in store ${adjustment.store_id}${dto.reason ? `: ${dto.reason}` : ''}`,
          });

          return rejected;
        }

        // 4. APPROVED decision: lock matching stock_balances FOR UPDATE
        let balance = await this.repository.lockBalance(
          client,
          adjustment.store_id,
          adjustment.part_id,
        );

        // Missing balance handling:
        // A missing balance must never allow a negative adjustment.
        // Positive approved adjustment safely initializes a zero balance atomically.
        if (!balance) {
          if (adjustment.quantity_delta < 0) {
            throw insufficientStock('Cannot decrease stock when no balance row exists');
          }
          await this.repository.initZeroBalance(client, adjustment.store_id, adjustment.part_id);
          balance = await this.repository.lockBalance(
            client,
            adjustment.store_id,
            adjustment.part_id,
          );
          if (!balance) {
            throw insufficientStock();
          }
        }

        const currentOnHand = Number(balance.on_hand);
        const currentReserved = Number(balance.reserved);
        const newOnHand = currentOnHand + Number(adjustment.quantity_delta);

        // Reject if on-hand would fall below zero or below reserved
        if (newOnHand < 0 || newOnHand < currentReserved) {
          throw insufficientStock(
            'Adjustment would cause on-hand stock to fall below reserved or zero',
          );
        }

        const unitCostAmount = balance.average_cost_currency ? balance.average_cost_amount : null;
        const unitCostCurrency = balance.average_cost_currency ?? null;
        const movementReason = buildMovementReason(
          adjustment.reason_code,
          adjustment.note,
          dto.reason,
        );

        // Append immutable ADJUSTMENT stock movement
        const movementId = await this.repository.createAdjustmentMovement(client, {
          storeId: adjustment.store_id,
          partId: adjustment.part_id,
          onHandDelta: Number(adjustment.quantity_delta),
          onHandAfter: newOnHand,
          reservedAfter: currentReserved,
          unitCostAmount,
          unitCostCurrency,
          stockAdjustmentId: adjustment.id,
          reason: movementReason,
          actorId: actor.id,
        });

        // Update materialized balance on_hand; reserved, min/max levels, and average cost are preserved
        await this.repository.updateBalanceOnHand(
          client,
          adjustment.store_id,
          adjustment.part_id,
          newOnHand,
        );

        // Mark adjustment APPROVED with stock_movement_id
        const approved = await this.repository.applyDecision(client, {
          adjustmentId,
          status: StockAdjustmentStatus.APPROVED,
          decidedBy: actor.id,
          decisionReason: dto.reason,
          stockMovementId: movementId,
        });

        // Write audit event
        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'STOCK_ADJUSTMENT.APPROVE',
          entityType: 'STOCK_ADJUSTMENT',
          entityId: adjustment.id,
          outcome: 'SUCCESS',
          summary: `Approved stock adjustment of ${adjustment.quantity_delta} for part ${adjustment.part_id} in store ${adjustment.store_id}: on-hand ${currentOnHand} -> ${newOnHand}`,
        });

        return approved;
      });

      return mapStockAdjustment(decided);
    } catch (error) {
      return mapConstraintError(error);
    }
  }
}

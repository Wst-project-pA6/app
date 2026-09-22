import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { PartStatus } from './dto/part.dto';
import {
  StockBalanceListQuery,
  StockLevelsUpdateRequest,
  StockMovementListQuery,
  StockReconciliationQuery,
} from './dto/stock-balance.dto';
import { StoreStatus } from './dto/store.dto';
import { PartsRepository } from './parts.repository';
import {
  StockBalanceRow,
  StockBalancesRepository,
  StockMovementRow,
} from './stock-balances.repository';
import { StoresRepository } from './stores.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const validationError = (message: string): AppError =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED, message);

function validateSort(sort: string | undefined, allowedFields: Set<string>): void {
  if (!sort) return;
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (!allowedFields.has(field)) {
      throw badRequest('Unknown sort field');
    }
  }
}

function mapBalance(row: StockBalanceRow, canReadCost: boolean) {
  const onHand = Number(row.on_hand);
  const reserved = Number(row.reserved);
  const minLevel = Number(row.min_level);
  const maxLevel = Number(row.max_level);
  const available = onHand - reserved;
  const belowMinimum = onHand <= minLevel;

  return {
    storeId: row.store_id,
    partId: row.part_id,
    sku: row.sku,
    partName: {
      en: row.name_en,
      ...(row.name_ar ? { ar: row.name_ar } : {}),
    },
    onHand,
    reserved,
    available,
    minLevel,
    maxLevel,
    ...(canReadCost
      ? {
          averageCost: {
            amount: String(row.average_cost_amount),
            currency: row.average_cost_currency ?? row.selling_price_currency,
          },
        }
      : {}),
    belowMinimum,
    updatedAt: row.updated_at,
  };
}

function mapMovement(row: StockMovementRow, canReadCost: boolean) {
  return {
    id: row.id,
    storeId: row.store_id,
    partId: row.part_id,
    type: row.type,
    onHandDelta: Number(row.on_hand_delta),
    reservedDelta: Number(row.reserved_delta),
    onHandAfter: Number(row.on_hand_after),
    reservedAfter: Number(row.reserved_after),
    ...(canReadCost && row.unit_cost_amount !== null && row.unit_cost_currency !== null
      ? {
          unitCost: {
            amount: String(row.unit_cost_amount),
            currency: row.unit_cost_currency,
          },
        }
      : {}),
    ...(row.job_id ? { jobId: row.job_id } : {}),
    ...(row.part_issue_id ? { partIssueId: row.part_issue_id } : {}),
    ...(row.purchase_order_id ? { purchaseOrderId: row.purchase_order_id } : {}),
    ...(row.goods_receipt_id ? { goodsReceiptId: row.goods_receipt_id } : {}),
    ...(row.stock_adjustment_id ? { stockAdjustmentId: row.stock_adjustment_id } : {}),
    ...(row.reason ? { reason: row.reason } : {}),
    actorId: row.actor_id,
    occurredAt: row.occurred_at,
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
  if (dbError?.code === '23514' && dbError.constraint === 'chk_levels_order') {
    throw validationError('maxLevel must be greater than or equal to minLevel');
  }
  throw error;
}

const BALANCE_SORT_ALLOWED = new Set(['sku', 'onHand', 'available']);
const MOVEMENT_SORT_ALLOWED = new Set(['occurredAt']);

@Injectable()
export class StockBalancesService {
  constructor(
    private readonly repository: StockBalancesRepository,
    private readonly storesRepository: StoresRepository,
    private readonly partsRepository: PartsRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async listBalances(query: StockBalanceListQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort, BALANCE_SORT_ALLOWED);
    const scopes = this.scopeService.allowedScopeIds(actor);
    const result = await this.repository.listBalances(query, scopes);
    const canReadCost = actor.permissions.includes('inventory.cost.read');
    return mapPage(
      query,
      result.rows.map((row) => mapBalance(row, canReadCost)),
      result.totalItems,
    );
  }

  async replaceLevels(
    storeId: string,
    partId: string,
    dto: StockLevelsUpdateRequest,
    actor: AuthenticatedPrincipal,
  ) {
    if (dto.maxLevel < dto.minLevel) {
      throw validationError('maxLevel must be greater than or equal to minLevel');
    }

    const scopes = this.scopeService.allowedScopeIds(actor);
    const canReadCost = actor.permissions.includes('inventory.cost.read');

    try {
      const balance = await this.transaction.runInTransaction(async (client) => {
        const store = await this.storesRepository.findScoped(storeId, scopes, client, true);
        if (!store || store.status !== StoreStatus.ACTIVE) {
          throw notFound();
        }

        const part = await this.partsRepository.findById(client, partId, true);
        if (!part || part.status !== PartStatus.ACTIVE) {
          throw notFound();
        }

        const row = await this.repository.replaceLevels(
          client,
          storeId,
          partId,
          dto.minLevel,
          dto.maxLevel,
        );

        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'STOCK_LEVELS.UPDATE',
          entityType: 'STOCK_BALANCE',
          entityId: partId,
          outcome: 'SUCCESS',
          summary: `Updated stock levels for part ${partId} in store ${storeId} to min ${dto.minLevel}, max ${dto.maxLevel}`,
        });

        return row;
      });

      return mapBalance(balance, canReadCost);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async getReconciliation(query: StockReconciliationQuery, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);

    if (query.storeId) {
      const store = await this.storesRepository.findScoped(query.storeId, scopes);
      if (!store) {
        throw notFound();
      }
    }

    const rows = await this.repository.getReconciliation(scopes, query.storeId);
    const mismatches = rows
      .filter(
        (r) =>
          r.ledger_on_hand !== r.balance_on_hand ||
          r.ledger_reserved !== r.balance_reserved,
      )
      .map((r) => ({
        storeId: r.store_id,
        partId: r.part_id,
        ledgerOnHand: Number(r.ledger_on_hand),
        balanceOnHand: Number(r.balance_on_hand),
        ledgerReserved: Number(r.ledger_reserved),
        balanceReserved: Number(r.balance_reserved),
      }));

    return {
      generatedAt: new Date(),
      checkedBalances: rows.length,
      mismatchCount: mismatches.length,
      reconciled: mismatches.length === 0,
      mismatches,
    };
  }

  async listMovements(query: StockMovementListQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort, MOVEMENT_SORT_ALLOWED);

    if (query.from && query.to && Date.parse(query.from) >= Date.parse(query.to)) {
      throw badRequest('From must be before to');
    }

    const scopes = this.scopeService.allowedScopeIds(actor);
    const result = await this.repository.listMovements(query, scopes);
    const canReadCost = actor.permissions.includes('inventory.cost.read');
    return mapPage(
      query,
      result.rows.map((row) => mapMovement(row, canReadCost)),
      result.totalItems,
    );
  }
}

import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import {
  StockAdjustmentListQuery,
  StockAdjustmentReasonCode,
  StockAdjustmentStatus,
} from './dto/stock-adjustment.dto';

export interface StockAdjustmentRow {
  id: string;
  store_id: string;
  part_id: string;
  quantity_delta: number;
  reason_code: StockAdjustmentReasonCode;
  note: string | null;
  status: StockAdjustmentStatus;
  requested_by: string;
  decided_by: string | null;
  decided_at: Date | null;
  decision_reason: string | null;
  stock_movement_id: string | null;
  idempotency_key: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AdjustmentStockBalanceRow {
  store_id: string;
  part_id: string;
  on_hand: number;
  reserved: number;
  min_level: number;
  max_level: number;
  average_cost_amount: string;
  average_cost_currency: string | null;
}

const STOCK_ADJUSTMENT_SELECT = `
  sa.id, sa.store_id, sa.part_id, sa.quantity_delta, sa.reason_code, sa.note,
  sa.status, sa.requested_by, sa.decided_by, sa.decided_at, sa.decision_reason,
  sa.stock_movement_id, sa.idempotency_key, sa.created_at, sa.updated_at`;

export function orderAdjustmentsBy(sort?: string): string {
  const requested = sort ? sort.split(',') : ['-createdAt'];
  return requested
    .map((part) => {
      const descending = part.startsWith('-');
      const fieldName = descending ? part.slice(1) : part;
      if (fieldName !== 'createdAt') {
        throw new Error('INVALID_SORT');
      }
      return `sa.created_at ${descending ? 'DESC' : 'ASC'}`;
    })
    .join(', ');
}

@Injectable()
export class StockAdjustmentsRepository {
  constructor(private readonly db: DatabaseService) {}

  async list(
    query: StockAdjustmentListQuery,
    allowedScopeIds: string[],
  ): Promise<{ rows: StockAdjustmentRow[]; totalItems: number }> {
    const where = [
      's.organization_scope_id = ANY($1::uuid[])',
      `EXISTS (SELECT 1 FROM organization_scopes os
               WHERE os.id = s.organization_scope_id AND os.status = 'ACTIVE')`,
    ];
    const params: unknown[] = [allowedScopeIds];

    if (query.status) {
      params.push(query.status);
      where.push(`sa.status = $${params.length}`);
    }

    if (query.storeId) {
      params.push(query.storeId);
      where.push(`sa.store_id = $${params.length}`);
    }

    if (query.partId) {
      params.push(query.partId);
      where.push(`sa.part_id = $${params.length}`);
    }

    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;

    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count
       FROM stock_adjustments sa
       JOIN stores s ON s.id = sa.store_id
       ${condition}`,
      params,
    );

    const rows = await this.db.query<StockAdjustmentRow>(
      `SELECT ${STOCK_ADJUSTMENT_SELECT}
       FROM stock_adjustments sa
       JOIN stores s ON s.id = sa.store_id
       ${condition}
       ORDER BY ${orderAdjustmentsBy(query.sort)}, sa.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );

    return { rows: rows.rows, totalItems: count ?? 0 };
  }

  async acquireIdempotencyLock(client: PoolClient, namespace: string, key: string): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [namespace, key]);
  }

  async findByIdempotencyKey(
    client: PoolClient,
    idempotencyKey: string,
  ): Promise<StockAdjustmentRow | null> {
    const result = await client.query<StockAdjustmentRow>(
      `SELECT ${STOCK_ADJUSTMENT_SELECT}
       FROM stock_adjustments sa
       WHERE sa.idempotency_key = $1`,
      [idempotencyKey],
    );
    return result.rows[0] ?? null;
  }

  async create(
    client: PoolClient,
    data: {
      storeId: string;
      partId: string;
      quantityDelta: number;
      reasonCode: StockAdjustmentReasonCode;
      note?: string;
      requestedBy: string;
      idempotencyKey?: string;
    },
  ): Promise<StockAdjustmentRow> {
    const result = await client.query<StockAdjustmentRow>(
      `INSERT INTO stock_adjustments
         (store_id, part_id, quantity_delta, reason_code, note, status,
          requested_by, idempotency_key, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, 'PENDING_APPROVAL', $6, $7, now(), now())
       RETURNING ${STOCK_ADJUSTMENT_SELECT.replaceAll('sa.', '')}`,
      [
        data.storeId,
        data.partId,
        data.quantityDelta,
        data.reasonCode,
        data.note ?? null,
        data.requestedBy,
        data.idempotencyKey ?? null,
      ],
    );
    return result.rows[0];
  }

  async lockAdjustment(
    client: PoolClient,
    adjustmentId: string,
    allowedScopeIds: string[],
  ): Promise<StockAdjustmentRow | null> {
    const result = await client.query<StockAdjustmentRow>(
      `SELECT ${STOCK_ADJUSTMENT_SELECT}
       FROM stock_adjustments sa
       JOIN stores s ON s.id = sa.store_id
       WHERE sa.id = $1
         AND s.organization_scope_id = ANY($2::uuid[])
         AND EXISTS (SELECT 1 FROM organization_scopes os
                     WHERE os.id = s.organization_scope_id AND os.status = 'ACTIVE')
       FOR UPDATE OF sa`,
      [adjustmentId, allowedScopeIds],
    );
    return result.rows[0] ?? null;
  }

  async lockBalance(
    client: PoolClient,
    storeId: string,
    partId: string,
  ): Promise<AdjustmentStockBalanceRow | null> {
    const result = await client.query<AdjustmentStockBalanceRow>(
      `SELECT store_id, part_id, on_hand, reserved, min_level, max_level,
              average_cost_amount, average_cost_currency
       FROM stock_balances
       WHERE store_id = $1 AND part_id = $2
       FOR UPDATE`,
      [storeId, partId],
    );
    return result.rows[0] ?? null;
  }

  async initZeroBalance(
    client: PoolClient,
    storeId: string,
    partId: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO stock_balances
         (store_id, part_id, on_hand, reserved, min_level, max_level,
          average_cost_amount, average_cost_currency, updated_at)
       VALUES
         ($1, $2, 0, 0, 0, 0, 0, NULL, now())
       ON CONFLICT (store_id, part_id) DO NOTHING`,
      [storeId, partId],
    );
  }

  async updateBalanceOnHand(
    client: PoolClient,
    storeId: string,
    partId: string,
    newOnHand: number,
  ): Promise<void> {
    await client.query(
      `UPDATE stock_balances
       SET on_hand = $3,
           updated_at = now()
       WHERE store_id = $1 AND part_id = $2`,
      [storeId, partId, newOnHand],
    );
  }

  async createAdjustmentMovement(
    client: PoolClient,
    data: {
      storeId: string;
      partId: string;
      onHandDelta: number;
      onHandAfter: number;
      reservedAfter: number;
      unitCostAmount: string | null;
      unitCostCurrency: string | null;
      stockAdjustmentId: string;
      reason: string;
      actorId: string;
    },
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO stock_movements
         (store_id, part_id, type, on_hand_delta, reserved_delta, on_hand_after, reserved_after,
          unit_cost_amount, unit_cost_currency, stock_adjustment_id, reason, actor_id, occurred_at)
       VALUES
         ($1, $2, 'ADJUSTMENT', $3, 0, $4, $5, $6, $7, $8, $9, $10, now())
       RETURNING id`,
      [
        data.storeId,
        data.partId,
        data.onHandDelta,
        data.onHandAfter,
        data.reservedAfter,
        data.unitCostAmount,
        data.unitCostCurrency,
        data.stockAdjustmentId,
        data.reason,
        data.actorId,
      ],
    );
    return result.rows[0].id;
  }

  async applyDecision(
    client: PoolClient,
    data: {
      adjustmentId: string;
      status: StockAdjustmentStatus;
      decidedBy: string;
      decisionReason?: string;
      stockMovementId?: string;
    },
  ): Promise<StockAdjustmentRow> {
    const result = await client.query<StockAdjustmentRow>(
      `UPDATE stock_adjustments
       SET status = $2,
           decided_by = $3,
           decided_at = now(),
           decision_reason = $4,
           stock_movement_id = $5,
           updated_at = now()
       WHERE id = $1
       RETURNING ${STOCK_ADJUSTMENT_SELECT.replaceAll('sa.', '')}`,
      [
        data.adjustmentId,
        data.status,
        data.decidedBy,
        data.decisionReason ?? null,
        data.stockMovementId ?? null,
      ],
    );
    return result.rows[0];
  }
}

import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import {
  StockBalanceListQuery,
  StockMovementListQuery,
  StockMovementType,
} from './dto/stock-balance.dto';

export interface StockBalanceRow {
  store_id: string;
  part_id: string;
  sku: string;
  name_en: string;
  name_ar: string | null;
  selling_price_currency: string;
  on_hand: number;
  reserved: number;
  min_level: number;
  max_level: number;
  average_cost_amount: string;
  average_cost_currency: string | null;
  updated_at: Date;
}

export interface ReconciliationRow {
  store_id: string;
  part_id: string;
  ledger_on_hand: number;
  balance_on_hand: number;
  ledger_reserved: number;
  balance_reserved: number;
}

export interface StockMovementRow {
  id: string;
  store_id: string;
  part_id: string;
  type: StockMovementType;
  on_hand_delta: number;
  reserved_delta: number;
  on_hand_after: number;
  reserved_after: number;
  unit_cost_amount: string | null;
  unit_cost_currency: string | null;
  job_id: string | null;
  part_issue_id: string | null;
  purchase_order_id: string | null;
  goods_receipt_id: string | null;
  stock_adjustment_id: string | null;
  reason: string | null;
  actor_id: string;
  occurred_at: Date;
}

const BALANCE_SELECT = `
  sb.store_id, sb.part_id, p.sku, p.name_en, p.name_ar, p.selling_price_currency,
  sb.on_hand, sb.reserved, sb.min_level, sb.max_level,
  sb.average_cost_amount, sb.average_cost_currency, sb.updated_at`;

const MOVEMENT_SELECT = `
  sm.id, sm.store_id, sm.part_id, sm.type, sm.on_hand_delta, sm.reserved_delta,
  sm.on_hand_after, sm.reserved_after, sm.unit_cost_amount, sm.unit_cost_currency,
  sm.job_id, sm.part_issue_id, sm.purchase_order_id, sm.goods_receipt_id,
  sm.stock_adjustment_id, sm.reason, sm.actor_id, sm.occurred_at`;

const BALANCE_SORT_FIELDS: Record<string, string> = {
  sku: 'p.sku',
  onHand: 'sb.on_hand',
  available: '(sb.on_hand - sb.reserved)',
};

export function orderBalancesBy(sort?: string): string {
  const requested = sort ? sort.split(',') : ['sku'];
  return requested
    .map((part) => {
      const descending = part.startsWith('-');
      const fieldName = descending ? part.slice(1) : part;
      const column = BALANCE_SORT_FIELDS[fieldName];
      if (!column) throw new Error('INVALID_SORT');
      return `${column} ${descending ? 'DESC' : 'ASC'}`;
    })
    .join(', ');
}

export function orderMovementsBy(sort?: string): string {
  const requested = sort ? sort.split(',') : ['-occurredAt'];
  return requested
    .map((part) => {
      const descending = part.startsWith('-');
      const fieldName = descending ? part.slice(1) : part;
      if (fieldName !== 'occurredAt') throw new Error('INVALID_SORT');
      return `sm.occurred_at ${descending ? 'DESC' : 'ASC'}`;
    })
    .join(', ');
}

@Injectable()
export class StockBalancesRepository {
  constructor(private readonly db: DatabaseService) {}

  async listBalances(
    query: StockBalanceListQuery,
    allowedScopeIds: string[],
  ): Promise<{ rows: StockBalanceRow[]; totalItems: number }> {
    const where = [
      's.organization_scope_id = ANY($1::uuid[])',
      `EXISTS (SELECT 1 FROM organization_scopes os
               WHERE os.id = s.organization_scope_id AND os.status = 'ACTIVE')`,
    ];
    const params: unknown[] = [allowedScopeIds];

    if (query.storeId) {
      params.push(query.storeId);
      where.push(`sb.store_id = $${params.length}`);
    }

    if (query.partId) {
      params.push(query.partId);
      where.push(`sb.part_id = $${params.length}`);
    }

    if (query.category) {
      params.push(query.category);
      where.push(`p.category = $${params.length}`);
    }

    if (query.belowMinimum !== undefined) {
      if (query.belowMinimum) {
        where.push('sb.on_hand <= sb.min_level');
      } else {
        where.push('sb.on_hand > sb.min_level');
      }
    }

    if (query.stockedOut !== undefined) {
      if (query.stockedOut) {
        where.push('sb.on_hand = 0');
      } else {
        where.push('sb.on_hand > 0');
      }
    }

    if (query.q) {
      params.push(`%${query.q}%`);
      const p = `$${params.length}`;
      where.push(`(p.sku ILIKE ${p} OR p.name_en ILIKE ${p} OR p.name_ar ILIKE ${p} OR p.barcode ILIKE ${p})`);
    }

    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;

    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count
       FROM stock_balances sb
       JOIN parts p ON p.id = sb.part_id
       JOIN stores s ON s.id = sb.store_id
       ${condition}`,
      params,
    );

    const rows = await this.db.query<StockBalanceRow>(
      `SELECT ${BALANCE_SELECT}
       FROM stock_balances sb
       JOIN parts p ON p.id = sb.part_id
       JOIN stores s ON s.id = sb.store_id
       ${condition}
       ORDER BY ${orderBalancesBy(query.sort)}, sb.store_id ASC, sb.part_id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );

    return { rows: rows.rows, totalItems: count ?? 0 };
  }

  async replaceLevels(
    client: PoolClient,
    storeId: string,
    partId: string,
    minLevel: number,
    maxLevel: number,
  ): Promise<StockBalanceRow> {
    const sql = `
      WITH upserted AS (
        INSERT INTO stock_balances
          (store_id, part_id, min_level, max_level, on_hand, reserved, average_cost_amount, average_cost_currency, updated_at)
        VALUES
          ($1, $2, $3, $4, 0, 0, 0, NULL, CURRENT_TIMESTAMP)
        ON CONFLICT (store_id, part_id) DO UPDATE
        SET min_level = EXCLUDED.min_level,
            max_level = EXCLUDED.max_level,
            updated_at = CURRENT_TIMESTAMP
        RETURNING
          store_id, part_id, on_hand, reserved, min_level, max_level,
          average_cost_amount, average_cost_currency, updated_at
      )
      SELECT
        u.store_id,
        u.part_id,
        p.sku,
        p.name_en,
        p.name_ar,
        p.selling_price_currency,
        u.on_hand,
        u.reserved,
        u.min_level,
        u.max_level,
        u.average_cost_amount,
        u.average_cost_currency,
        u.updated_at
      FROM upserted u
      JOIN parts p ON p.id = u.part_id`;

    const result = await client.query<StockBalanceRow>(sql, [storeId, partId, minLevel, maxLevel]);
    return result.rows[0];
  }

  async getReconciliation(
    allowedScopeIds: string[],
    storeId?: string,
  ): Promise<ReconciliationRow[]> {
    const params: unknown[] = [allowedScopeIds];
    let storeConditionSm = '';
    let storeConditionSb = '';

    if (storeId) {
      params.push(storeId);
      const storeParam = `$${params.length}`;
      storeConditionSm = `AND sm.store_id = ${storeParam}`;
      storeConditionSb = `AND sb.store_id = ${storeParam}`;
    }

    const sql = `
      WITH ledger AS (
        SELECT
          sm.store_id,
          sm.part_id,
          COALESCE(SUM(sm.on_hand_delta), 0)::int AS ledger_on_hand,
          COALESCE(SUM(sm.reserved_delta), 0)::int AS ledger_reserved
        FROM stock_movements sm
        JOIN stores s ON s.id = sm.store_id
        WHERE s.organization_scope_id = ANY($1::uuid[])
          AND EXISTS (SELECT 1 FROM organization_scopes os
                      WHERE os.id = s.organization_scope_id AND os.status = 'ACTIVE')
          ${storeConditionSm}
        GROUP BY sm.store_id, sm.part_id
      ),
      balances AS (
        SELECT
          sb.store_id,
          sb.part_id,
          sb.on_hand AS balance_on_hand,
          sb.reserved AS balance_reserved
        FROM stock_balances sb
        JOIN stores s ON s.id = sb.store_id
        WHERE s.organization_scope_id = ANY($1::uuid[])
          AND EXISTS (SELECT 1 FROM organization_scopes os
                      WHERE os.id = s.organization_scope_id AND os.status = 'ACTIVE')
          ${storeConditionSb}
      )
      SELECT
        COALESCE(b.store_id, l.store_id) AS store_id,
        COALESCE(b.part_id, l.part_id) AS part_id,
        COALESCE(l.ledger_on_hand, 0)::int AS ledger_on_hand,
        COALESCE(b.balance_on_hand, 0)::int AS balance_on_hand,
        COALESCE(l.ledger_reserved, 0)::int AS ledger_reserved,
        COALESCE(b.balance_reserved, 0)::int AS balance_reserved
      FROM balances b
      FULL OUTER JOIN ledger l ON l.store_id = b.store_id AND l.part_id = b.part_id
      ORDER BY store_id ASC, part_id ASC`;

    const result = await this.db.query<ReconciliationRow>(sql, params);
    return result.rows;
  }

  async listMovements(
    query: StockMovementListQuery,
    allowedScopeIds: string[],
  ): Promise<{ rows: StockMovementRow[]; totalItems: number }> {
    const where = [
      's.organization_scope_id = ANY($1::uuid[])',
      `EXISTS (SELECT 1 FROM organization_scopes os
               WHERE os.id = s.organization_scope_id AND os.status = 'ACTIVE')`,
    ];
    const params: unknown[] = [allowedScopeIds];

    if (query.storeId) {
      params.push(query.storeId);
      where.push(`sm.store_id = $${params.length}`);
    }

    if (query.partId) {
      params.push(query.partId);
      where.push(`sm.part_id = $${params.length}`);
    }

    if (query.type) {
      params.push(query.type);
      where.push(`sm.type = $${params.length}`);
    }

    if (query.jobId) {
      params.push(query.jobId);
      where.push(`sm.job_id = $${params.length}`);
    }

    if (query.purchaseOrderId) {
      params.push(query.purchaseOrderId);
      where.push(`sm.purchase_order_id = $${params.length}`);
    }

    if (query.goodsReceiptId) {
      params.push(query.goodsReceiptId);
      where.push(`sm.goods_receipt_id = $${params.length}`);
    }

    if (query.stockAdjustmentId) {
      params.push(query.stockAdjustmentId);
      where.push(`sm.stock_adjustment_id = $${params.length}`);
    }

    if (query.from) {
      params.push(query.from);
      where.push(`sm.occurred_at >= $${params.length}::timestamptz`);
    }

    if (query.to) {
      params.push(query.to);
      where.push(`sm.occurred_at < $${params.length}::timestamptz`);
    }

    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;

    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count
       FROM stock_movements sm
       JOIN stores s ON s.id = sm.store_id
       ${condition}`,
      params,
    );

    const rows = await this.db.query<StockMovementRow>(
      `SELECT ${MOVEMENT_SELECT}
       FROM stock_movements sm
       JOIN stores s ON s.id = sm.store_id
       ${condition}
       ORDER BY ${orderMovementsBy(query.sort)}, sm.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );

    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}

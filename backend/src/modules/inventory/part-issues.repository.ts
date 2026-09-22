import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { PartIssueListQuery, PartIssueStatus } from './dto/part-issue.dto';
import { StockMovementType } from './dto/stock-balance.dto';

export interface PartIssueRow {
  id: string;
  job_id: string;
  part_id: string;
  part_sku: string;
  store_id: string;
  work_item_id: string | null;
  reservation_id: string | null;
  quantity: number;
  reversed_quantity: number;
  unit_price_amount: string;
  unit_price_currency: string;
  unit_cost_amount: string | null;
  unit_cost_currency: string | null;
  line_total_amount: string;
  line_total_currency: string;
  status: PartIssueStatus;
  stock_movement_id: string;
  idempotency_key: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface PartIssueReversalRow {
  id: string;
  part_issue_id: string;
  quantity: number;
  reason: string;
  reversed_by: string;
  reversed_at: Date;
  stock_movement_id: string;
  idempotency_key: string | null;
}

export interface IssueStockBalanceRow {
  store_id: string;
  part_id: string;
  on_hand: number;
  reserved: number;
  average_cost_amount: string;
  average_cost_currency: string | null;
}

const PART_ISSUE_SELECT = `
  pi.id, pi.job_id, pi.part_id, pi.part_sku, pi.store_id, pi.work_item_id, pi.reservation_id,
  pi.quantity, pi.reversed_quantity, pi.unit_price_amount, pi.unit_price_currency,
  pi.unit_cost_amount, pi.unit_cost_currency, pi.line_total_amount, pi.line_total_currency,
  pi.status, pi.stock_movement_id, pi.idempotency_key,
  pi.created_at, pi.updated_at, pi.created_by, pi.updated_by`;

const PART_ISSUE_REVERSAL_SELECT = `
  r.id, r.part_issue_id, r.quantity, r.reason, r.reversed_by, r.reversed_at,
  r.stock_movement_id, r.idempotency_key`;

export function orderPartIssuesBy(sort?: string): string {
  const requested = sort ? sort.split(',') : ['createdAt'];
  return requested
    .map((part) => {
      const descending = part.startsWith('-');
      const fieldName = descending ? part.slice(1) : part;
      if (fieldName !== 'createdAt') throw new Error('INVALID_SORT');
      return `pi.created_at ${descending ? 'DESC' : 'ASC'}`;
    })
    .join(', ');
}

@Injectable()
export class PartIssuesRepository {
  constructor(private readonly db: DatabaseService) {}

  async listByJobId(
    jobId: string,
    query: PartIssueListQuery,
  ): Promise<{ rows: PartIssueRow[]; totalItems: number }> {
    const offset = (query.page - 1) * query.pageSize;

    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM part_issues pi WHERE pi.job_id = $1`,
      [jobId],
    );

    const rows = await this.db.query<PartIssueRow>(
      `SELECT ${PART_ISSUE_SELECT}
       FROM part_issues pi
       WHERE pi.job_id = $1
       ORDER BY ${orderPartIssuesBy(query.sort)}, pi.id ASC
       LIMIT $2 OFFSET $3`,
      [jobId, query.pageSize, offset],
    );

    return { rows: rows.rows, totalItems: count ?? 0 };
  }

  async acquireIdempotencyLock(client: PoolClient, namespace: string, key: string): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [namespace, key]);
  }

  async findByIdempotencyKey(client: PoolClient, idempotencyKey: string): Promise<PartIssueRow | null> {
    const result = await client.query<PartIssueRow>(
      `SELECT ${PART_ISSUE_SELECT} FROM part_issues pi WHERE pi.idempotency_key = $1`,
      [idempotencyKey],
    );
    return result.rows[0] ?? null;
  }

  async findReversalByIdempotencyKey(
    client: PoolClient,
    idempotencyKey: string,
  ): Promise<PartIssueReversalRow | null> {
    const result = await client.query<PartIssueReversalRow>(
      `SELECT ${PART_ISSUE_REVERSAL_SELECT} FROM part_issue_reversals r WHERE r.idempotency_key = $1`,
      [idempotencyKey],
    );
    return result.rows[0] ?? null;
  }

  async hasApprovedAdditionalWorkApproval(client: PoolClient, workItemId: string): Promise<boolean> {
    const result = await client.query(
      `SELECT 1 FROM job_approval_work_items jwi
       JOIN job_approvals ja ON ja.id = jwi.approval_id
       WHERE jwi.work_item_id = $1 AND ja.scope = 'ADDITIONAL_WORK' AND ja.status = 'APPROVED'
       LIMIT 1`,
      [workItemId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async lockBalanceForIssue(
    client: PoolClient,
    storeId: string,
    partId: string,
  ): Promise<IssueStockBalanceRow | null> {
    const result = await client.query<IssueStockBalanceRow>(
      `SELECT store_id, part_id, on_hand, reserved, average_cost_amount, average_cost_currency
       FROM stock_balances
       WHERE store_id = $1 AND part_id = $2
       FOR UPDATE`,
      [storeId, partId],
    );
    return result.rows[0] ?? null;
  }

  async updateBalanceForIssue(
    client: PoolClient,
    storeId: string,
    partId: string,
    onHandDelta: number,
    reservedDelta: number,
  ): Promise<{ on_hand: number; reserved: number }> {
    const result = await client.query<{ on_hand: number; reserved: number }>(
      `UPDATE stock_balances
       SET on_hand = on_hand + $3,
           reserved = reserved + $4,
           updated_at = now()
       WHERE store_id = $1 AND part_id = $2
       RETURNING on_hand, reserved`,
      [storeId, partId, onHandDelta, reservedDelta],
    );
    return result.rows[0];
  }

  async computeLineTotal(client: PoolClient, unitPriceAmount: string, quantity: number): Promise<string> {
    const result = await client.query<{ line_total: string }>(
      `SELECT ROUND($1::numeric * $2::numeric, 4) AS line_total`,
      [unitPriceAmount, quantity],
    );
    return result.rows[0].line_total;
  }

  async createIssueMovement(
    client: PoolClient,
    data: {
      storeId: string;
      partId: string;
      onHandDelta: number;
      reservedDelta: number;
      onHandAfter: number;
      reservedAfter: number;
      unitCostAmount: string | null;
      unitCostCurrency: string | null;
      jobId: string;
      actorId: string;
      reason?: string;
    },
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO stock_movements
         (store_id, part_id, type, on_hand_delta, reserved_delta, on_hand_after, reserved_after,
          unit_cost_amount, unit_cost_currency, job_id, actor_id, reason, occurred_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
       RETURNING id`,
      [
        data.storeId,
        data.partId,
        StockMovementType.ISSUE,
        data.onHandDelta,
        data.reservedDelta,
        data.onHandAfter,
        data.reservedAfter,
        data.unitCostAmount,
        data.unitCostCurrency,
        data.jobId,
        data.actorId,
        data.reason ?? null,
      ],
    );
    return result.rows[0].id;
  }

  async createPartIssue(
    client: PoolClient,
    data: {
      jobId: string;
      partId: string;
      partSku: string;
      storeId: string;
      workItemId?: string;
      reservationId?: string;
      quantity: number;
      unitPriceAmount: string;
      unitPriceCurrency: string;
      unitCostAmount: string | null;
      unitCostCurrency: string | null;
      lineTotalAmount: string;
      lineTotalCurrency: string;
      stockMovementId: string;
      idempotencyKey?: string;
      actorId: string;
    },
  ): Promise<PartIssueRow> {
    const result = await client.query<PartIssueRow>(
      `INSERT INTO part_issues
         (job_id, part_id, part_sku, store_id, work_item_id, reservation_id, quantity,
          reversed_quantity, unit_price_amount, unit_price_currency, unit_cost_amount, unit_cost_currency,
          line_total_amount, line_total_currency, status, stock_movement_id, idempotency_key,
          created_by, updated_by, created_at, updated_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, $11, $12, $13, 'ISSUED', $14, $15, $16, $16, now(), now())
       RETURNING ${PART_ISSUE_SELECT.replaceAll('pi.', '')}`,
      [
        data.jobId,
        data.partId,
        data.partSku,
        data.storeId,
        data.workItemId ?? null,
        data.reservationId ?? null,
        data.quantity,
        data.unitPriceAmount,
        data.unitPriceCurrency,
        data.unitCostAmount,
        data.unitCostCurrency,
        data.lineTotalAmount,
        data.lineTotalCurrency,
        data.stockMovementId,
        data.idempotencyKey ?? null,
        data.actorId,
      ],
    );
    return result.rows[0];
  }

  async lockIssue(client: PoolClient, partIssueId: string): Promise<PartIssueRow | null> {
    const result = await client.query<PartIssueRow>(
      `SELECT ${PART_ISSUE_SELECT} FROM part_issues pi WHERE pi.id = $1 FOR UPDATE`,
      [partIssueId],
    );
    return result.rows[0] ?? null;
  }

  async findIssueById(client: PoolClient, partIssueId: string): Promise<PartIssueRow | null> {
    const result = await client.query<PartIssueRow>(
      `SELECT ${PART_ISSUE_SELECT} FROM part_issues pi WHERE pi.id = $1`,
      [partIssueId],
    );
    return result.rows[0] ?? null;
  }

  async createReversalMovement(
    client: PoolClient,
    data: {
      storeId: string;
      partId: string;
      onHandAfter: number;
      reservedAfter: number;
      unitCostAmount: string | null;
      unitCostCurrency: string | null;
      jobId: string;
      partIssueId: string;
      actorId: string;
      reason: string;
      quantity: number;
    },
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO stock_movements
         (store_id, part_id, type, on_hand_delta, reserved_delta, on_hand_after, reserved_after,
          unit_cost_amount, unit_cost_currency, job_id, part_issue_id, actor_id, reason, occurred_at)
       VALUES
         ($1, $2, $3, $4, 0, $5, $6, $7, $8, $9, $10, $11, $12, now())
       RETURNING id`,
      [
        data.storeId,
        data.partId,
        StockMovementType.ISSUE_REVERSAL,
        data.quantity,
        data.onHandAfter,
        data.reservedAfter,
        data.unitCostAmount,
        data.unitCostCurrency,
        data.jobId,
        data.partIssueId,
        data.actorId,
        data.reason,
      ],
    );
    return result.rows[0].id;
  }

  async createReversal(
    client: PoolClient,
    data: {
      partIssueId: string;
      quantity: number;
      reason: string;
      reversedBy: string;
      stockMovementId: string;
      idempotencyKey?: string;
    },
  ): Promise<PartIssueReversalRow> {
    const result = await client.query<PartIssueReversalRow>(
      `INSERT INTO part_issue_reversals
         (part_issue_id, quantity, reason, reversed_by, stock_movement_id, idempotency_key, reversed_at)
       VALUES
         ($1, $2, $3, $4, $5, $6, now())
       RETURNING ${PART_ISSUE_REVERSAL_SELECT.replaceAll('r.', '')}`,
      [
        data.partIssueId,
        data.quantity,
        data.reason,
        data.reversedBy,
        data.stockMovementId,
        data.idempotencyKey ?? null,
      ],
    );
    return result.rows[0];
  }

  async applyReversal(
    client: PoolClient,
    partIssueId: string,
    quantityDelta: number,
    status: PartIssueStatus,
    actorId: string,
  ): Promise<PartIssueRow> {
    const result = await client.query<PartIssueRow>(
      `UPDATE part_issues
       SET reversed_quantity = reversed_quantity + $2,
           status = $3,
           updated_by = $4,
           updated_at = now()
       WHERE id = $1
       RETURNING ${PART_ISSUE_SELECT.replaceAll('pi.', '')}`,
      [partIssueId, quantityDelta, status, actorId],
    );
    return result.rows[0];
  }
}

import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import {
  PurchaseOrderListQuery,
  PurchaseOrderStatus,
} from './dto/purchase-order.dto';

export interface PurchaseOrderRow {
  id: string;
  po_number: string;
  vendor_id: string;
  store_id: string;
  status: PurchaseOrderStatus;
  total_amount: string;
  total_currency: string;
  required_approvals: number | null;
  approvals_recorded: number;
  source_prediction_id: string | null;
  expected_delivery_date: string | null;
  notes: string | null;
  submitted_at: Date | null;
  cancellation_reason: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  created_by: string;
  updated_by: string | null;
}

export interface PurchaseOrderLineRow {
  id: string;
  purchase_order_id: string;
  line_number: number;
  part_id: string;
  sku: string;
  quantity_ordered: number;
  quantity_accepted: number;
  quantity_rejected: number;
  unit_cost_amount: string;
  unit_cost_currency: string;
  line_total_amount: string;
  line_total_currency: string;
}

export interface PurchaseApprovalRow {
  id: string;
  purchase_order_id: string;
  approver_id: string;
  decision: 'APPROVED' | 'REJECTED';
  reason: string | null;
  decided_at: Date;
}

export interface GoodsReceiptRow {
  id: string;
  receipt_number: string;
  purchase_order_id: string;
  store_id: string;
  delivery_reference: string | null;
  received_at: Date;
  received_by: string;
  idempotency_key: string | null;
}

export interface GoodsReceiptLineRow {
  id: string;
  goods_receipt_id: string;
  purchase_order_line_id: string;
  part_id: string;
  quantity_received: number;
  quantity_accepted: number;
  quantity_rejected: number;
  rejection_reason: string | null;
  stock_movement_id: string | null;
}

@Injectable()
export class PurchaseOrdersRepository {
  constructor(private readonly db: DatabaseService) {}

  async verifyStoreInScope(
    storeId: string,
    scopeIds: string[],
    client?: PoolClient,
  ): Promise<boolean> {
    const q = client ?? this.db.getPool();
    const result = await q.query<{ organization_scope_id: string; status: string }>(
      `SELECT organization_scope_id, status FROM stores WHERE id = $1`,
      [storeId],
    );
    if (result.rows.length === 0) return false;
    const store = result.rows[0];
    if (store.status !== 'ACTIVE') return false;
    return scopeIds.includes(store.organization_scope_id);
  }

  async verifyVendorActive(vendorId: string, client?: PoolClient): Promise<boolean> {
    const q = client ?? this.db.getPool();
    const result = await q.query<{ status: string }>(
      `SELECT status FROM vendors WHERE id = $1`,
      [vendorId],
    );
    return result.rows.length > 0 && result.rows[0].status === 'ACTIVE';
  }

  async verifyPartsActive(
    partIds: string[],
    client?: PoolClient,
  ): Promise<Map<string, { sku: string; status: string }>> {
    const q = client ?? this.db.getPool();
    const result = await q.query<{ id: string; sku: string; status: string }>(
      `SELECT id, sku, status FROM parts WHERE id = ANY($1)`,
      [partIds],
    );
    const map = new Map<string, { sku: string; status: string }>();
    for (const r of result.rows) {
      map.set(r.id, { sku: r.sku, status: r.status });
    }
    return map;
  }

  async getSystemCurrency(client?: PoolClient): Promise<string> {
    const q = client ?? this.db.getPool();
    const result = await q.query<{ currency_code: string }>(
      `SELECT currency_code FROM purchase_approval_policy WHERE id = TRUE`,
    );
    if (result.rows.length === 0) {
      throw new AppError(
        HttpStatus.NOT_FOUND,
        ErrorCode.NOT_FOUND,
        'Purchase approval policy is not configured',
      );
    }
    return result.rows[0].currency_code.trim();
  }

  async generatePoNumber(client: PoolClient): Promise<string> {
    const res = await client.query<{ nextval: string }>(`SELECT nextval('po_number_seq')`);
    const seq = parseInt(res.rows[0].nextval, 10);
    const year = new Date().getUTCFullYear();
    return `PO-${year}-${String(seq).padStart(6, '0')}`;
  }

  async generateReceiptNumber(client: PoolClient): Promise<string> {
    const res = await client.query<{ nextval: string }>(`SELECT nextval('goods_receipt_number_seq')`);
    const seq = parseInt(res.rows[0].nextval, 10);
    const year = new Date().getUTCFullYear();
    return `GR-${year}-${String(seq).padStart(6, '0')}`;
  }

  async findById(
    id: string,
    scopeIds: string[],
    client?: PoolClient,
  ): Promise<{ po: PurchaseOrderRow; lines: PurchaseOrderLineRow[] } | null> {
    const q = client ?? this.db.getPool();
    const poResult = await q.query<PurchaseOrderRow>(
      `SELECT po.id, po.po_number, po.vendor_id, po.store_id, po.status,
              po.total_amount, po.total_currency, po.required_approvals,
              po.approvals_recorded, po.source_prediction_id,
              po.expected_delivery_date::text as expected_delivery_date,
              po.notes, po.submitted_at, po.cancellation_reason,
              po.version, po.created_at, po.updated_at, po.created_by, po.updated_by
       FROM purchase_orders po
       JOIN stores s ON po.store_id = s.id
       WHERE po.id = $1 AND s.organization_scope_id = ANY($2)`,
      [id, scopeIds],
    );

    if (poResult.rows.length === 0) {
      return null;
    }

    const linesResult = await q.query<PurchaseOrderLineRow>(
      `SELECT l.id, l.purchase_order_id, l.line_number, l.part_id, p.sku,
              l.quantity_ordered, l.quantity_accepted, l.quantity_rejected,
              l.unit_cost_amount, l.unit_cost_currency,
              l.line_total_amount, l.line_total_currency
       FROM purchase_order_lines l
       JOIN parts p ON l.part_id = p.id
       WHERE l.purchase_order_id = $1
       ORDER BY l.line_number ASC`,
      [id],
    );

    return {
      po: poResult.rows[0],
      lines: linesResult.rows,
    };
  }

  async lockPo(
    id: string,
    scopeIds: string[],
    client: PoolClient,
  ): Promise<PurchaseOrderRow | null> {
    const result = await client.query<PurchaseOrderRow>(
      `SELECT po.id, po.po_number, po.vendor_id, po.store_id, po.status,
              po.total_amount, po.total_currency, po.required_approvals,
              po.approvals_recorded, po.source_prediction_id,
              po.expected_delivery_date::text as expected_delivery_date,
              po.notes, po.submitted_at, po.cancellation_reason,
              po.version, po.created_at, po.updated_at, po.created_by, po.updated_by
       FROM purchase_orders po
       JOIN stores s ON po.store_id = s.id
       WHERE po.id = $1 AND s.organization_scope_id = ANY($2)
       FOR UPDATE`,
      [id, scopeIds],
    );
    return result.rows[0] ?? null;
  }

  async list(
    query: PurchaseOrderListQuery,
    scopeIds: string[],
  ): Promise<{ items: PurchaseOrderRow[]; total: number }> {
    const conditions: string[] = ['s.organization_scope_id = ANY($1)'];
    const params: unknown[] = [scopeIds];
    let paramIndex = 2;

    if (query.status) {
      conditions.push(`po.status = $${paramIndex++}`);
      params.push(query.status);
    }
    if (query.vendorId) {
      conditions.push(`po.vendor_id = $${paramIndex++}`);
      params.push(query.vendorId);
    }
    if (query.storeId) {
      conditions.push(`po.store_id = $${paramIndex++}`);
      params.push(query.storeId);
    }
    if (query.poNumber) {
      conditions.push(`po.po_number ILIKE $${paramIndex++}`);
      params.push(`%${query.poNumber}%`);
    }
    if (query.from) {
      conditions.push(`po.created_at >= $${paramIndex++}`);
      params.push(query.from);
    }
    if (query.to) {
      conditions.push(`po.created_at <= $${paramIndex++}`);
      params.push(query.to);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await this.db.getPool().query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM purchase_orders po
       JOIN stores s ON po.store_id = s.id
       ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    let orderBy = 'po.created_at DESC';
    if (query.sort) {
      const sortField = query.sort.startsWith('-') ? query.sort.substring(1) : query.sort;
      const direction = query.sort.startsWith('-') ? 'DESC' : 'ASC';
      if (['poNumber', 'createdAt', 'total', 'expectedDeliveryDate'].includes(sortField)) {
        let col = 'po.created_at';
        if (sortField === 'poNumber') col = 'po.po_number';
        if (sortField === 'total') col = 'po.total_amount';
        if (sortField === 'expectedDeliveryDate') col = 'po.expected_delivery_date';
        orderBy = `${col} ${direction}`;
      }
    }

    const offset = (query.page - 1) * query.pageSize;
    const limit = query.pageSize;

    const listResult = await this.db.getPool().query<PurchaseOrderRow>(
      `SELECT po.id, po.po_number, po.vendor_id, po.store_id, po.status,
              po.total_amount, po.total_currency, po.required_approvals,
              po.approvals_recorded, po.source_prediction_id,
              po.expected_delivery_date::text as expected_delivery_date,
              po.notes, po.submitted_at, po.cancellation_reason,
              po.version, po.created_at, po.updated_at, po.created_by, po.updated_by
       FROM purchase_orders po
       JOIN stores s ON po.store_id = s.id
       ${whereClause}
       ORDER BY ${orderBy}, po.id ASC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset],
    );

    return {
      items: listResult.rows,
      total,
    };
  }

  async getLinesForPo(poId: string, client?: PoolClient): Promise<PurchaseOrderLineRow[]> {
    const q = client ?? this.db.getPool();
    const res = await q.query<PurchaseOrderLineRow>(
      `SELECT l.id, l.purchase_order_id, l.line_number, l.part_id, p.sku,
              l.quantity_ordered, l.quantity_accepted, l.quantity_rejected,
              l.unit_cost_amount, l.unit_cost_currency,
              l.line_total_amount, l.line_total_currency
       FROM purchase_order_lines l
       JOIN parts p ON l.part_id = p.id
       WHERE l.purchase_order_id = $1
       ORDER BY l.line_number ASC`,
      [poId],
    );
    return res.rows;
  }
}

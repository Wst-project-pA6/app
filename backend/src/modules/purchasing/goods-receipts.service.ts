import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  GoodsReceiptCreateDto,
  GoodsReceiptListQuery,
  GoodsReceiptPageResponse,
  GoodsReceiptResponse,
} from './dto/goods-receipt.dto';
import {
  GoodsReceiptLineRow,
  GoodsReceiptRow,
  PurchaseOrderLineRow,
  PurchaseOrdersRepository,
} from './purchase-orders.repository';

@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly repo: PurchaseOrdersRepository,
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(
    poId: string,
    query: GoodsReceiptListQuery,
    actor: AuthenticatedPrincipal,
  ): Promise<GoodsReceiptPageResponse> {
    const scopeIds = actor.organizationScopeIds ?? [];
    const poResult = await this.repo.findById(poId, scopeIds);
    if (!poResult) {
      throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Purchase order not found');
    }

    let orderBy = 'received_at DESC';
    if (query.sort) {
      const isDesc = query.sort.startsWith('-');
      const field = isDesc ? query.sort.substring(1) : query.sort;
      if (field === 'receivedAt') {
        orderBy = `received_at ${isDesc ? 'DESC' : 'ASC'}`;
      }
    }

    const countResult = await this.db.getPool().query<{ count: string }>(
      `SELECT COUNT(*) as count FROM goods_receipts WHERE purchase_order_id = $1`,
      [poId],
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (query.page - 1) * query.pageSize;
    const limit = query.pageSize;

    const receiptsResult = await this.db.getPool().query<GoodsReceiptRow>(
      `SELECT id, receipt_number, purchase_order_id, store_id, delivery_reference,
              received_at, received_by, idempotency_key
       FROM goods_receipts
       WHERE purchase_order_id = $1
       ORDER BY ${orderBy}, id ASC
       LIMIT $2 OFFSET $3`,
      [poId, limit, offset],
    );

    const items: GoodsReceiptResponse[] = [];
    for (const r of receiptsResult.rows) {
      const lines = await this.getReceiptLines(r.id);
      items.push(this.mapReceipt(r, lines));
    }

    const totalPages = Math.ceil(total / query.pageSize);
    return {
      items,
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages,
      },
    };
  }

  async create(
    poId: string,
    dto: GoodsReceiptCreateDto,
    idempotencyKey: string | undefined,
    actor: AuthenticatedPrincipal,
  ): Promise<GoodsReceiptResponse> {
    const scopeIds = actor.organizationScopeIds ?? [];

    // 1. Line payload validations
    const requestedLineIds = dto.lines.map((l) => l.purchaseOrderLineId);
    const uniqueLineIds = new Set(requestedLineIds);
    if (uniqueLineIds.size !== requestedLineIds.length) {
      throw new AppError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.VALIDATION_FAILED,
        'Duplicate purchase order line IDs in receipt request',
      );
    }

    for (const line of dto.lines) {
      if (line.quantityReceived !== line.quantityAccepted + line.quantityRejected) {
        throw new AppError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          ErrorCode.VALIDATION_FAILED,
          'quantityReceived must equal quantityAccepted + quantityRejected',
        );
      }
      if (line.quantityRejected > 0 && (!line.rejectionReason || line.rejectionReason.trim().length === 0)) {
        throw new AppError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          ErrorCode.VALIDATION_FAILED,
          'rejectionReason is required when quantityRejected is greater than 0',
        );
      }
    }

    return this.db.runInTransaction(async (client: PoolClient) => {
      // 2. Idempotency handling
      if (idempotencyKey) {
        await client.query(
          `SELECT pg_advisory_xact_lock(hashtext('goods_receipt'), hashtext($1))`,
          [idempotencyKey],
        );

        const existingResult = await client.query<GoodsReceiptRow>(
          `SELECT id, receipt_number, purchase_order_id, store_id, delivery_reference,
                  received_at, received_by, idempotency_key
           FROM goods_receipts
           WHERE idempotency_key = $1`,
          [idempotencyKey],
        );

        if (existingResult.rows.length > 0) {
          const existing = existingResult.rows[0];

          // Validate same caller and same PO
          if (existing.received_by !== actor.id || existing.purchase_order_id !== poId) {
            throw new AppError(
              HttpStatus.CONFLICT,
              ErrorCode.IDEMPOTENCY_CONFLICT,
              'Idempotency key conflict',
            );
          }

          // Validate delivery reference
          if ((existing.delivery_reference ?? null) !== (dto.deliveryReference ?? null)) {
            throw new AppError(
              HttpStatus.CONFLICT,
              ErrorCode.IDEMPOTENCY_CONFLICT,
              'Idempotency key conflict',
            );
          }

          // Validate semantic match of lines
          const existingLines = await this.getReceiptLines(existing.id, client);
          if (existingLines.length !== dto.lines.length) {
            throw new AppError(
              HttpStatus.CONFLICT,
              ErrorCode.IDEMPOTENCY_CONFLICT,
              'Idempotency key conflict',
            );
          }

          const existingLineMap = new Map(existingLines.map((l) => [l.purchase_order_line_id, l]));
          for (const reqLine of dto.lines) {
            const exLine = existingLineMap.get(reqLine.purchaseOrderLineId);
            if (
              !exLine ||
              exLine.quantity_received !== reqLine.quantityReceived ||
              exLine.quantity_accepted !== reqLine.quantityAccepted ||
              exLine.quantity_rejected !== reqLine.quantityRejected
            ) {
              throw new AppError(
                HttpStatus.CONFLICT,
                ErrorCode.IDEMPOTENCY_CONFLICT,
                'Idempotency key conflict',
              );
            }
          }

          // Verify scope of store
          const poStoreOk = await this.repo.verifyStoreInScope(existing.store_id, scopeIds, client);
          if (!poStoreOk) {
            throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Purchase order not found');
          }

          return this.mapReceipt(existing, existingLines);
        }
      }

      // 3. Lock 1: Lock PO row FOR UPDATE
      const po = await this.repo.lockPo(poId, scopeIds, client);
      if (!po) {
        throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Purchase order not found');
      }

      if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.INVALID_STATE_TRANSITION,
          `Cannot receive goods for purchase order in status '${po.status}'`,
        );
      }

      // 4. Lock 2: Lock requested PO lines in stable ascending order
      const sortedRequestedLineIds = [...requestedLineIds].sort();
      const poLinesResult = await client.query<PurchaseOrderLineRow>(
        `SELECT l.id, l.purchase_order_id, l.line_number, l.part_id, p.sku,
                l.quantity_ordered, l.quantity_accepted, l.quantity_rejected,
                l.unit_cost_amount, l.unit_cost_currency,
                l.line_total_amount, l.line_total_currency
         FROM purchase_order_lines l
         JOIN parts p ON l.part_id = p.id
         WHERE l.id = ANY($1) AND l.purchase_order_id = $2
         ORDER BY l.id ASC
         FOR UPDATE`,
        [sortedRequestedLineIds, poId],
      );

      if (poLinesResult.rows.length !== sortedRequestedLineIds.length) {
        throw new AppError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          ErrorCode.VALIDATION_FAILED,
          'One or more line IDs do not belong to this purchase order',
        );
      }

      const poLineMap = new Map(poLinesResult.rows.map((l) => [l.id, l]));

      // Validate cumulative quantities
      for (const reqLine of dto.lines) {
        const poLine = poLineMap.get(reqLine.purchaseOrderLineId)!;
        const newCumulative = poLine.quantity_accepted + reqLine.quantityAccepted;
        if (newCumulative > poLine.quantity_ordered) {
          throw new AppError(
            HttpStatus.CONFLICT,
            ErrorCode.RECEIPT_EXCEEDS_ORDERED,
            `Accepted quantity (${newCumulative}) exceeds ordered quantity (${poLine.quantity_ordered}) for line ${poLine.line_number}`,
          );
        }
      }

      // 5. Lock 3: Affected balances in stable store/part order
      const acceptedLines = dto.lines.filter((l) => l.quantityAccepted > 0);
      const affectedPartIds = [
        ...new Set(acceptedLines.map((l) => poLineMap.get(l.purchaseOrderLineId)!.part_id)),
      ].sort();

      if (affectedPartIds.length > 0) {
        // Lock parts
        await client.query(
          `SELECT id FROM parts WHERE id = ANY($1) ORDER BY id ASC FOR UPDATE`,
          [affectedPartIds],
        );

        // Ensure zero balances exist
        for (const partId of affectedPartIds) {
          await client.query(
            `INSERT INTO stock_balances (
               store_id, part_id, on_hand, reserved,
               average_cost_amount, average_cost_currency
             )
             VALUES ($1, $2, 0, 0, 0, $3)
             ON CONFLICT (store_id, part_id) DO NOTHING`,
            [po.store_id, partId, po.total_currency],
          );
        }

        // Lock stock_balances
        await client.query(
          // stock_balances has no surrogate id column — its primary key is (store_id, part_id).
          `SELECT store_id, part_id FROM stock_balances
           WHERE store_id = $1 AND part_id = ANY($2)
           ORDER BY part_id ASC
           FOR UPDATE`,
          [po.store_id, affectedPartIds],
        );
      }

      // 6. Insert goods_receipt header
      const receiptNumber = await this.repo.generateReceiptNumber(client);
      const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();

      let receiptRow: GoodsReceiptRow;
      try {
        const receiptInsert = await client.query<GoodsReceiptRow>(
          `INSERT INTO goods_receipts (
             receipt_number, purchase_order_id, store_id,
             delivery_reference, received_at, received_by, idempotency_key
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            receiptNumber,
            poId,
            po.store_id,
            dto.deliveryReference ?? null,
            receivedAt,
            actor.id,
            idempotencyKey ?? null,
          ],
        );
        receiptRow = receiptInsert.rows[0];
      } catch (err: unknown) {
        const error = err as { code?: string; constraint?: string };
        if (error.code === '23505' && error.constraint === 'uq_goods_receipts_idempotency') {
          throw new AppError(
            HttpStatus.CONFLICT,
            ErrorCode.IDEMPOTENCY_CONFLICT,
            'Idempotency key conflict',
          );
        }
        throw err;
      }

      // 7. Process lines, update balances & insert stock movements
      const createdReceiptLines: GoodsReceiptLineRow[] = [];

      for (const reqLine of dto.lines) {
        const poLine = poLineMap.get(reqLine.purchaseOrderLineId)!;

        // Update PO line cumulative quantities
        await client.query(
          `UPDATE purchase_order_lines
           SET quantity_accepted = quantity_accepted + $1,
               quantity_rejected = quantity_rejected + $2
           WHERE id = $3`,
          [reqLine.quantityAccepted, reqLine.quantityRejected, poLine.id],
        );

        let stockMovementId: string | null = null;

        if (reqLine.quantityAccepted > 0) {
          // Update stock balance with weighted average cost in PostgreSQL
          const balanceUpdate = await client.query<{
            on_hand: number;
            reserved: number;
          }>(
            `UPDATE stock_balances
             SET
               average_cost_amount = CASE
                 WHEN on_hand = 0 THEN $1::numeric
                 ELSE ROUND(((on_hand::numeric * average_cost_amount) + ($2::numeric * $1::numeric)) / (on_hand::numeric + $2::numeric), 4)
               END,
               on_hand = on_hand + $2::integer,
               updated_at = NOW()
             WHERE store_id = $3 AND part_id = $4
             RETURNING on_hand, reserved`,
            [poLine.unit_cost_amount, reqLine.quantityAccepted, po.store_id, poLine.part_id],
          );
          const updatedBalance = balanceUpdate.rows[0];

          // Insert stock movement
          const smInsert = await client.query<{ id: string }>(
            `INSERT INTO stock_movements (
               store_id, part_id, type,
               on_hand_delta, reserved_delta,
               on_hand_after, reserved_after,
               unit_cost_amount, unit_cost_currency,
               purchase_order_id, goods_receipt_id,
               actor_id, occurred_at
             )
             VALUES (
               $1, $2, 'RECEIPT',
               $3, 0,
               $4, $5,
               $6, $7,
               $8, $9,
               $10, $11
             )
             RETURNING id`,
            [
              po.store_id,
              poLine.part_id,
              reqLine.quantityAccepted,
              updatedBalance.on_hand,
              updatedBalance.reserved,
              poLine.unit_cost_amount,
              poLine.unit_cost_currency,
              po.id,
              receiptRow.id,
              actor.id,
              receivedAt,
            ],
          );
          stockMovementId = smInsert.rows[0].id;
        }

        // Insert goods_receipt_lines
        const grLineInsert = await client.query<GoodsReceiptLineRow>(
          `INSERT INTO goods_receipt_lines (
             goods_receipt_id, purchase_order_line_id, part_id,
             quantity_received, quantity_accepted, quantity_rejected,
             rejection_reason, stock_movement_id
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            receiptRow.id,
            poLine.id,
            poLine.part_id,
            reqLine.quantityReceived,
            reqLine.quantityAccepted,
            reqLine.quantityRejected,
            reqLine.rejectionReason ?? null,
            stockMovementId,
          ],
        );
        createdReceiptLines.push(grLineInsert.rows[0]);
      }

      // 8. Advance PO status
      const allPoLinesResult = await client.query<{
        quantity_ordered: number;
        quantity_accepted: number;
      }>(
        `SELECT quantity_ordered, quantity_accepted
         FROM purchase_order_lines
         WHERE purchase_order_id = $1`,
        [poId],
      );

      const allReceived = allPoLinesResult.rows.every(
        (l) => l.quantity_accepted === l.quantity_ordered,
      );
      const nextPoStatus = allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

      await client.query(
        `UPDATE purchase_orders
         SET status = $1,
             version = version + 1,
             updated_at = NOW(),
             updated_by = $2
         WHERE id = $3`,
        [nextPoStatus, actor.id, poId],
      );

      // 9. Audit
      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'GOODS_RECEIPT.CREATE',
        entityType: 'GOODS_RECEIPT',
        entityId: receiptRow.id,
        outcome: 'SUCCESS',
        summary: `Created goods receipt ${receiptRow.receipt_number} for PO ${po.po_number} (status advanced to ${nextPoStatus})`,
      });

      return this.mapReceipt(receiptRow, createdReceiptLines);
    });
  }

  private async getReceiptLines(
    receiptId: string,
    client?: PoolClient,
  ): Promise<GoodsReceiptLineRow[]> {
    const q = client ?? this.db.getPool();
    const res = await q.query<GoodsReceiptLineRow>(
      `SELECT id, goods_receipt_id, purchase_order_line_id, part_id,
              quantity_received, quantity_accepted, quantity_rejected,
              rejection_reason, stock_movement_id
       FROM goods_receipt_lines
       WHERE goods_receipt_id = $1
       ORDER BY id ASC`,
      [receiptId],
    );
    return res.rows;
  }

  private mapReceipt(row: GoodsReceiptRow, lines: GoodsReceiptLineRow[]): GoodsReceiptResponse {
    return {
      id: row.id,
      receiptNumber: row.receipt_number,
      purchaseOrderId: row.purchase_order_id,
      storeId: row.store_id,
      deliveryReference: row.delivery_reference,
      receivedAt: row.received_at.toISOString(),
      lines: lines.map((l) => ({
        purchaseOrderLineId: l.purchase_order_line_id,
        partId: l.part_id,
        quantityReceived: l.quantity_received,
        quantityAccepted: l.quantity_accepted,
        quantityRejected: l.quantity_rejected,
        rejectionReason: l.rejection_reason,
        stockMovementId: l.stock_movement_id,
      })),
      createdAt: row.received_at.toISOString(),
      updatedAt: row.received_at.toISOString(),
      createdBy: row.received_by,
      updatedBy: row.received_by,
    };
  }
}

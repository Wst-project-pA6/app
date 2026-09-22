import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  PurchaseOrderCreateDto,
  PurchaseOrderListQuery,
  PurchaseOrderPageResponse,
  PurchaseOrderResponse,
  PurchaseOrderTransitionDto,
  PurchaseOrderUpdateDto,
} from './dto/purchase-order.dto';
import {
  PurchaseOrderLineRow,
  PurchaseOrderRow,
  PurchaseOrdersRepository,
} from './purchase-orders.repository';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly repo: PurchaseOrdersRepository,
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async create(
    dto: PurchaseOrderCreateDto,
    actor: AuthenticatedPrincipal,
  ): Promise<PurchaseOrderResponse> {
    const scopeIds = actor.organizationScopeIds ?? [];

    return this.db.runInTransaction(async (client: PoolClient) => {
      // 1. Verify store exists, is active, and is in caller's active scopes
      const storeOk = await this.repo.verifyStoreInScope(dto.storeId, scopeIds, client);
      if (!storeOk) {
        throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Store not found');
      }

      // 2. Verify vendor exists and is active
      const vendorOk = await this.repo.verifyVendorActive(dto.vendorId, client);
      if (!vendorOk) {
        throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Vendor not found');
      }

      // 3. Verify parts exist and are active
      const partIds = dto.lines.map((l) => l.partId);
      const partsMap = await this.repo.verifyPartsActive(partIds, client);
      for (const partId of partIds) {
        const part = partsMap.get(partId);
        if (!part || part.status !== 'ACTIVE') {
          throw new AppError(
            HttpStatus.NOT_FOUND,
            ErrorCode.NOT_FOUND,
            `Part '${partId}' not found or is inactive`,
          );
        }
      }

      // 4. Get system currency
      const systemCurrency = await this.repo.getSystemCurrency(client);

      // Validate all lines have system currency
      for (const line of dto.lines) {
        if (line.unitCost.currency !== systemCurrency) {
          throw new AppError(
            HttpStatus.UNPROCESSABLE_ENTITY,
            ErrorCode.VALIDATION_FAILED,
            `Unit cost currency '${line.unitCost.currency}' does not match system currency '${systemCurrency}'`,
          );
        }
      }

      // 5. Generate PO number
      const poNumber = await this.repo.generatePoNumber(client);

      // 6. Insert purchase order header
      const insertPoResult = await client.query<PurchaseOrderRow>(
        `INSERT INTO purchase_orders (
           po_number, vendor_id, store_id, status,
           total_amount, total_currency,
           required_approvals, approvals_recorded,
           source_prediction_id, expected_delivery_date, notes,
           version, created_by, updated_by
         )
         VALUES ($1, $2, $3, 'DRAFT', 0, $4, NULL, 0, $5, $6, $7, 1, $8, $8)
         RETURNING *`,
        [
          poNumber,
          dto.vendorId,
          dto.storeId,
          systemCurrency,
          dto.sourcePredictionId ?? null,
          dto.expectedDeliveryDate ?? null,
          dto.notes ?? null,
          actor.id,
        ],
      );
      const po = insertPoResult.rows[0];

      // 7. Insert lines and compute totals in PostgreSQL
      const createdLines: PurchaseOrderLineRow[] = [];

      for (let i = 0; i < dto.lines.length; i++) {
        const lineDto = dto.lines[i];
        const lineNumber = i + 1;
        const partInfo = partsMap.get(lineDto.partId)!;

        const lineResult = await client.query<PurchaseOrderLineRow>(
          `INSERT INTO purchase_order_lines (
             purchase_order_id, line_number, part_id,
             quantity_ordered, quantity_accepted, quantity_rejected,
             unit_cost_amount, unit_cost_currency,
             line_total_amount, line_total_currency
           )
           VALUES (
             $1, $2, $3,
             $4::integer, 0, 0,
             $5::numeric, $6,
             ROUND(($4::integer::numeric * $5::numeric), 4), $6
           )
           RETURNING id, purchase_order_id, line_number, part_id,
                     quantity_ordered, quantity_accepted, quantity_rejected,
                     unit_cost_amount, unit_cost_currency,
                     line_total_amount, line_total_currency`,
          [
            po.id,
            lineNumber,
            lineDto.partId,
            lineDto.quantityOrdered,
            lineDto.unitCost.amount,
            systemCurrency,
          ],
        );
        const createdLine = {
          ...lineResult.rows[0],
          sku: partInfo.sku,
        };
        createdLines.push(createdLine);
      }

      // 8. Update PO total in PostgreSQL
      const updateTotalResult = await client.query<PurchaseOrderRow>(
        `UPDATE purchase_orders
         SET total_amount = (
           SELECT COALESCE(SUM(line_total_amount), 0)
           FROM purchase_order_lines
           WHERE purchase_order_id = $1
         )
         WHERE id = $1
         RETURNING *`,
        [po.id],
      );
      const updatedPo = updateTotalResult.rows[0];

      // 9. Audit
      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'PO.CREATE',
        entityType: 'PURCHASE_ORDER',
        entityId: updatedPo.id,
        outcome: 'SUCCESS',
        summary: `Created purchase order ${updatedPo.po_number} in DRAFT status`,
      });

      return this.mapPurchaseOrder(updatedPo, createdLines);
    });
  }

  async list(
    query: PurchaseOrderListQuery,
    actor: AuthenticatedPrincipal,
  ): Promise<PurchaseOrderPageResponse> {
    const scopeIds = actor.organizationScopeIds ?? [];
    const { items, total } = await this.repo.list(query, scopeIds);

    const mappedItems: PurchaseOrderResponse[] = [];
    for (const po of items) {
      const lines = await this.repo.getLinesForPo(po.id);
      mappedItems.push(this.mapPurchaseOrder(po, lines));
    }

    const totalPages = Math.ceil(total / query.pageSize);
    return {
      items: mappedItems,
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages,
      },
    };
  }

  async getById(id: string, actor: AuthenticatedPrincipal): Promise<PurchaseOrderResponse> {
    const scopeIds = actor.organizationScopeIds ?? [];
    const result = await this.repo.findById(id, scopeIds);
    if (!result) {
      throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Purchase order not found');
    }
    return this.mapPurchaseOrder(result.po, result.lines);
  }

  async update(
    id: string,
    dto: PurchaseOrderUpdateDto,
    actor: AuthenticatedPrincipal,
  ): Promise<PurchaseOrderResponse> {
    const scopeIds = actor.organizationScopeIds ?? [];

    return this.db.runInTransaction(async (client: PoolClient) => {
      const current = await this.repo.lockPo(id, scopeIds, client);
      if (!current) {
        throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Purchase order not found');
      }

      if (current.status !== 'DRAFT') {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.INVALID_STATE_TRANSITION,
          'Only DRAFT orders can be edited',
        );
      }

      if (current.version !== dto.version) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.VERSION_CONFLICT,
          'Purchase order version conflict',
        );
      }

      if (dto.vendorId) {
        const vendorOk = await this.repo.verifyVendorActive(dto.vendorId, client);
        if (!vendorOk) {
          throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Vendor not found');
        }
      }

      // Handle lines replacement if supplied
      if (dto.lines) {
        const partIds = dto.lines.map((l) => l.partId);
        const partsMap = await this.repo.verifyPartsActive(partIds, client);
        for (const partId of partIds) {
          const part = partsMap.get(partId);
          if (!part || part.status !== 'ACTIVE') {
            throw new AppError(
              HttpStatus.NOT_FOUND,
              ErrorCode.NOT_FOUND,
              `Part '${partId}' not found or is inactive`,
            );
          }
        }

        const systemCurrency = current.total_currency;
        for (const line of dto.lines) {
          if (line.unitCost.currency !== systemCurrency) {
            throw new AppError(
              HttpStatus.UNPROCESSABLE_ENTITY,
              ErrorCode.VALIDATION_FAILED,
              `Unit cost currency must match order currency '${systemCurrency}'`,
            );
          }
        }

        // Delete existing lines
        await client.query(`DELETE FROM purchase_order_lines WHERE purchase_order_id = $1`, [id]);

        // Insert new lines
        for (let i = 0; i < dto.lines.length; i++) {
          const lineDto = dto.lines[i];
          const lineNumber = i + 1;
          await client.query(
            `INSERT INTO purchase_order_lines (
               purchase_order_id, line_number, part_id,
               quantity_ordered, quantity_accepted, quantity_rejected,
               unit_cost_amount, unit_cost_currency,
               line_total_amount, line_total_currency
             )
             VALUES (
               $1, $2, $3,
               $4::integer, 0, 0,
               $5::numeric, $6,
               ROUND(($4::integer::numeric * $5::numeric), 4), $6
             )`,
            [
              id,
              lineNumber,
              lineDto.partId,
              lineDto.quantityOrdered,
              lineDto.unitCost.amount,
              systemCurrency,
            ],
          );
        }
      }

      const updates: string[] = [];
      const params: unknown[] = [];
      let pIdx = 1;

      if (dto.vendorId !== undefined) {
        updates.push(`vendor_id = $${pIdx++}`);
        params.push(dto.vendorId);
      }
      if (dto.expectedDeliveryDate !== undefined) {
        updates.push(`expected_delivery_date = $${pIdx++}`);
        params.push(dto.expectedDeliveryDate);
      }
      if (dto.notes !== undefined) {
        updates.push(`notes = $${pIdx++}`);
        params.push(dto.notes);
      }

      if (dto.lines) {
        updates.push(
          `total_amount = (SELECT COALESCE(SUM(line_total_amount), 0) FROM purchase_order_lines WHERE purchase_order_id = $${pIdx++})`,
        );
        params.push(id);
      }

      updates.push(`version = version + 1`);
      updates.push(`updated_at = NOW()`);
      updates.push(`updated_by = $${pIdx++}`);
      params.push(actor.id);

      const updateResult = await client.query<PurchaseOrderRow>(
        `UPDATE purchase_orders
         SET ${updates.join(', ')}
         WHERE id = $${pIdx}
         RETURNING *`,
        [...params, id],
      );

      const updatedLines = await this.repo.getLinesForPo(id, client);

      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'PO.UPDATE',
        entityType: 'PURCHASE_ORDER',
        entityId: id,
        outcome: 'SUCCESS',
        summary: `Updated purchase order ${updateResult.rows[0].po_number}`,
      });

      return this.mapPurchaseOrder(updateResult.rows[0], updatedLines);
    });
  }

  async transition(
    id: string,
    dto: PurchaseOrderTransitionDto,
    actor: AuthenticatedPrincipal,
  ): Promise<PurchaseOrderResponse> {
    const scopeIds = actor.organizationScopeIds ?? [];

    return this.db.runInTransaction(async (client: PoolClient) => {
      const current = await this.repo.lockPo(id, scopeIds, client);
      if (!current) {
        throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Purchase order not found');
      }

      if (dto.toStatus === 'PENDING_APPROVAL') {
        if (current.status !== 'DRAFT') {
          throw new AppError(
            HttpStatus.CONFLICT,
            ErrorCode.INVALID_STATE_TRANSITION,
            `Cannot submit purchase order from status '${current.status}'`,
          );
        }

        // Match tier with greatest minimum_total <= po.total_amount
        const tierResult = await client.query<{ required_approvals: number }>(
          `SELECT required_approvals
           FROM purchase_approval_tiers
           WHERE policy_id = TRUE AND minimum_total <= $1::numeric
           ORDER BY minimum_total DESC
           LIMIT 1`,
          [current.total_amount],
        );

        const requiredApprovals = tierResult.rows.length > 0 ? tierResult.rows[0].required_approvals : 1;

        const updateResult = await client.query<PurchaseOrderRow>(
          `UPDATE purchase_orders
           SET status = 'PENDING_APPROVAL',
               required_approvals = $1,
               submitted_at = NOW(),
               version = version + 1,
               updated_at = NOW(),
               updated_by = $2
           WHERE id = $3
           RETURNING *`,
          [requiredApprovals, actor.id, id],
        );

        const lines = await this.repo.getLinesForPo(id, client);

        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'PO.TRANSITION',
          entityType: 'PURCHASE_ORDER',
          entityId: id,
          outcome: 'SUCCESS',
          summary: `Submitted purchase order ${current.po_number} for approval (requires ${requiredApprovals} approvals)`,
        });

        return this.mapPurchaseOrder(updateResult.rows[0], lines);
      }

      if (dto.toStatus === 'CANCELLED') {
        if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(current.status)) {
          throw new AppError(
            HttpStatus.CONFLICT,
            ErrorCode.INVALID_STATE_TRANSITION,
            `Cannot cancel purchase order in status '${current.status}'`,
          );
        }

        if (current.status === 'APPROVED') {
          const receiptsExist = await client.query<{ exists: boolean }>(
            `SELECT EXISTS(SELECT 1 FROM goods_receipts WHERE purchase_order_id = $1) as exists`,
            [id],
          );
          if (receiptsExist.rows[0].exists) {
            throw new AppError(
              HttpStatus.CONFLICT,
              ErrorCode.INVALID_STATE_TRANSITION,
              'Cannot cancel purchase order with existing goods receipts',
            );
          }
        }

        const updateResult = await client.query<PurchaseOrderRow>(
          `UPDATE purchase_orders
           SET status = 'CANCELLED',
               cancellation_reason = $1,
               version = version + 1,
               updated_at = NOW(),
               updated_by = $2
           WHERE id = $3
           RETURNING *`,
          [dto.reason, actor.id, id],
        );

        const lines = await this.repo.getLinesForPo(id, client);

        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'PO.TRANSITION',
          entityType: 'PURCHASE_ORDER',
          entityId: id,
          outcome: 'SUCCESS',
          summary: `Cancelled purchase order ${current.po_number}: ${dto.reason}`,
        });

        return this.mapPurchaseOrder(updateResult.rows[0], lines);
      }

      const targetStatus: string = dto.toStatus;
      throw new AppError(
        HttpStatus.CONFLICT,
        ErrorCode.INVALID_STATE_TRANSITION,
        `Unsupported transition to status '${targetStatus}'`,
      );
    });
  }

  private mapPurchaseOrder(
    po: PurchaseOrderRow,
    lines: PurchaseOrderLineRow[],
  ): PurchaseOrderResponse {
    return {
      id: po.id,
      poNumber: po.po_number,
      vendorId: po.vendor_id,
      storeId: po.store_id,
      status: po.status,
      lines: lines.map((l) => ({
        id: l.id,
        lineNumber: l.line_number,
        partId: l.part_id,
        sku: l.sku,
        quantityOrdered: l.quantity_ordered,
        quantityAccepted: l.quantity_accepted,
        quantityRejected: l.quantity_rejected,
        unitCost: {
          amount: l.unit_cost_amount,
          currency: l.unit_cost_currency.trim(),
        },
        lineTotal: {
          amount: l.line_total_amount,
          currency: l.line_total_currency.trim(),
        },
      })),
      total: {
        amount: po.total_amount,
        currency: po.total_currency.trim(),
      },
      requiredApprovals: po.required_approvals as 1 | 2 | null,
      approvalsRecorded: po.approvals_recorded,
      sourcePredictionId: po.source_prediction_id,
      expectedDeliveryDate: po.expected_delivery_date,
      notes: po.notes,
      submittedAt: po.submitted_at ? po.submitted_at.toISOString() : null,
      version: po.version,
      createdAt: po.created_at.toISOString(),
      updatedAt: po.updated_at.toISOString(),
      createdBy: po.created_by,
      updatedBy: po.updated_by,
    };
  }
}

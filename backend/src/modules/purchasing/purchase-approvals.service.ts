import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  PurchaseApprovalListQuery,
  PurchaseApprovalPageResponse,
  PurchaseApprovalRequestDto,
  PurchaseApprovalResponse,
} from './dto/purchase-approval.dto';
import {
  PurchaseApprovalRow,
  PurchaseOrdersRepository,
} from './purchase-orders.repository';

@Injectable()
export class PurchaseApprovalsService {
  constructor(
    private readonly repo: PurchaseOrdersRepository,
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(
    poId: string,
    query: PurchaseApprovalListQuery,
    actor: AuthenticatedPrincipal,
  ): Promise<PurchaseApprovalPageResponse> {
    const scopeIds = actor.organizationScopeIds ?? [];
    const poResult = await this.repo.findById(poId, scopeIds);
    if (!poResult) {
      throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Purchase order not found');
    }

    let orderBy = 'decided_at DESC';
    if (query.sort) {
      const isDesc = query.sort.startsWith('-');
      const field = isDesc ? query.sort.substring(1) : query.sort;
      if (field === 'decidedAt') {
        orderBy = `decided_at ${isDesc ? 'DESC' : 'ASC'}`;
      }
    }

    const countResult = await this.db.getPool().query<{ count: string }>(
      `SELECT COUNT(*) as count FROM purchase_approvals WHERE purchase_order_id = $1`,
      [poId],
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const offset = (query.page - 1) * query.pageSize;
    const limit = query.pageSize;

    const approvalsResult = await this.db.getPool().query<PurchaseApprovalRow>(
      `SELECT id, purchase_order_id, approver_id, decision, reason, decided_at
       FROM purchase_approvals
       WHERE purchase_order_id = $1
       ORDER BY ${orderBy}, id ASC
       LIMIT $2 OFFSET $3`,
      [poId, limit, offset],
    );

    const totalPages = Math.ceil(total / query.pageSize);
    return {
      items: approvalsResult.rows.map((r) => this.mapApproval(r)),
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages,
      },
    };
  }

  async decide(
    poId: string,
    dto: PurchaseApprovalRequestDto,
    actor: AuthenticatedPrincipal,
  ): Promise<PurchaseApprovalResponse> {
    const scopeIds = actor.organizationScopeIds ?? [];

    return this.db.runInTransaction(async (client: PoolClient) => {
      const po = await this.repo.lockPo(poId, scopeIds, client);
      if (!po) {
        throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Purchase order not found');
      }

      if (po.status !== 'PENDING_APPROVAL') {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.INVALID_STATE_TRANSITION,
          `Cannot decide purchase order in status '${po.status}'`,
        );
      }

      // Separation of duties check
      if (po.created_by === actor.id) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.SEPARATION_OF_DUTIES_VIOLATION,
          'The creator of the purchase order cannot approve or reject it',
        );
      }

      // Duplicate approval check
      const duplicateCheck = await client.query<{ exists: boolean }>(
        `SELECT EXISTS(
           SELECT 1 FROM purchase_approvals
           WHERE purchase_order_id = $1 AND approver_id = $2
         ) as exists`,
        [poId, actor.id],
      );
      if (duplicateCheck.rows[0].exists) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.DUPLICATE_APPROVAL,
          'Approver has already recorded a decision for this purchase order',
        );
      }

      try {
        const insertResult = await client.query<PurchaseApprovalRow>(
          `INSERT INTO purchase_approvals (purchase_order_id, approver_id, decision, reason)
           VALUES ($1, $2, $3, $4)
           RETURNING id, purchase_order_id, approver_id, decision, reason, decided_at`,
          [poId, actor.id, dto.decision, dto.reason ?? null],
        );
        const approval = insertResult.rows[0];

        if (dto.decision === 'REJECTED') {
          await client.query(
            `UPDATE purchase_orders
             SET status = 'REJECTED',
                 version = version + 1,
                 updated_at = NOW(),
                 updated_by = $1
             WHERE id = $2`,
            [actor.id, poId],
          );

          await this.audit.record(client, {
            actorUserId: actor.id,
            actorRoles: actor.roles,
            action: 'PO.APPROVAL.REJECT',
            entityType: 'PURCHASE_ORDER',
            entityId: poId,
            outcome: 'SUCCESS',
            summary: `Rejected purchase order ${po.po_number}: ${dto.reason}`,
          });

          return this.mapApproval(approval);
        }

        // dto.decision === 'APPROVED'
        const newRecorded = po.approvals_recorded + 1;
        const requiredApprovals = po.required_approvals ?? 1;
        const newStatus = newRecorded >= requiredApprovals ? 'APPROVED' : 'PENDING_APPROVAL';

        await client.query(
          `UPDATE purchase_orders
           SET status = $1,
               approvals_recorded = $2,
               version = version + 1,
               updated_at = NOW(),
               updated_by = $3
           WHERE id = $4`,
          [newStatus, newRecorded, actor.id, poId],
        );

        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'PO.APPROVAL.APPROVE',
          entityType: 'PURCHASE_ORDER',
          entityId: poId,
          outcome: 'SUCCESS',
          summary: `Approved purchase order ${po.po_number} (${newRecorded}/${requiredApprovals} approvals recorded, status: ${newStatus})`,
        });

        return this.mapApproval(approval);
      } catch (err: unknown) {
        const error = err as { code?: string; constraint?: string; message?: string };
        if (error.code === '23505' && error.constraint === 'uq_purchase_approval_per_approver') {
          throw new AppError(
            HttpStatus.CONFLICT,
            ErrorCode.DUPLICATE_APPROVAL,
            'Approver has already recorded a decision for this purchase order',
          );
        }
        if (error.message && error.message.includes('separation of duties')) {
          throw new AppError(
            HttpStatus.CONFLICT,
            ErrorCode.SEPARATION_OF_DUTIES_VIOLATION,
            'The creator of the purchase order cannot approve or reject it',
          );
        }
        throw err;
      }
    });
  }

  private mapApproval(row: PurchaseApprovalRow): PurchaseApprovalResponse {
    return {
      id: row.id,
      purchaseOrderId: row.purchase_order_id,
      approverId: row.approver_id,
      decision: row.decision,
      reason: row.reason,
      decidedAt: row.decided_at.toISOString(),
    };
  }
}

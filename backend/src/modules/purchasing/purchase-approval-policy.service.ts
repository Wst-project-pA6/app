import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  PurchaseApprovalPolicyResponse,
  PurchaseApprovalPolicyUpdateDto,
} from './dto/purchase-approval-policy.dto';
import {
  PolicyRow,
  PurchaseApprovalPolicyRepository,
  TierRow,
} from './purchase-approval-policy.repository';

@Injectable()
export class PurchaseApprovalPolicyService {
  constructor(
    private readonly repo: PurchaseApprovalPolicyRepository,
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async getPolicy(): Promise<PurchaseApprovalPolicyResponse> {
    const { policy, tiers } = await this.repo.getPolicy();
    if (!policy) {
      throw new AppError(
        HttpStatus.NOT_FOUND,
        ErrorCode.NOT_FOUND,
        'Purchase approval policy is not configured',
      );
    }
    return this.mapPolicy(policy, tiers);
  }

  async replacePolicy(
    dto: PurchaseApprovalPolicyUpdateDto,
    actor: AuthenticatedPrincipal,
  ): Promise<PurchaseApprovalPolicyResponse> {
    // Validate first tier begins at 0
    if (Number(dto.tiers[0].minimumTotal) !== 0) {
      throw new AppError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        ErrorCode.VALIDATION_FAILED,
        'The first approval tier must start at 0',
      );
    }

    // Validate tiers are strictly ascending
    for (let i = 1; i < dto.tiers.length; i++) {
      if (Number(dto.tiers[i].minimumTotal) <= Number(dto.tiers[i - 1].minimumTotal)) {
        throw new AppError(
          HttpStatus.UNPROCESSABLE_ENTITY,
          ErrorCode.VALIDATION_FAILED,
          'Approval tiers must have strictly ascending minimumTotal values',
        );
      }
    }

    return this.db.runInTransaction(async (client: PoolClient) => {
      const current = await this.repo.lockPolicy(client);
      if (!current) {
        throw new AppError(
          HttpStatus.NOT_FOUND,
          ErrorCode.NOT_FOUND,
          'Purchase approval policy is not configured',
        );
      }

      if (current.version !== dto.version) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.VERSION_CONFLICT,
          'Purchase approval policy version conflict',
        );
      }

      const updated = await this.repo.replaceTiersAndUpdate(client, actor.id, dto.tiers);

      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'CONFIG.PURCHASE_POLICY.UPDATE',
        entityType: 'PURCHASE_APPROVAL_POLICY',
        entityId: null,
        outcome: 'SUCCESS',
        summary: `Updated purchase approval policy to version ${updated.policy.version}`,
      });

      return this.mapPolicy(updated.policy, updated.tiers);
    });
  }

  private mapPolicy(policy: PolicyRow, tiers: TierRow[]): PurchaseApprovalPolicyResponse {
    return {
      version: policy.version,
      currencyCode: policy.currency_code.trim(),
      tiers: tiers.map((t) => ({
        minimumTotal: t.minimum_total,
        requiredApprovals: t.required_approvals as 1 | 2,
      })),
      updatedAt: policy.updated_at.toISOString(),
      updatedBy: policy.updated_by,
    };
  }
}

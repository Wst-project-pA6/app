import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { ApprovalTierDto } from './dto/purchase-approval-policy.dto';

export interface PolicyRow {
  id: boolean;
  version: number;
  currency_code: string;
  updated_at: Date;
  updated_by: string | null;
}

export interface TierRow {
  id: string;
  policy_id: boolean;
  minimum_total: string;
  required_approvals: number;
}

@Injectable()
export class PurchaseApprovalPolicyRepository {
  constructor(private readonly db: DatabaseService) {}

  async getPolicy(client?: PoolClient): Promise<{ policy: PolicyRow | null; tiers: TierRow[] }> {
    const q = client ?? this.db.getPool();
    const policyResult = await q.query<PolicyRow>(
      `SELECT id, version, currency_code, updated_at, updated_by
       FROM purchase_approval_policy
       WHERE id = TRUE`,
    );

    if (policyResult.rows.length === 0) {
      return { policy: null, tiers: [] };
    }

    const tiersResult = await q.query<TierRow>(
      `SELECT id, policy_id, minimum_total, required_approvals
       FROM purchase_approval_tiers
       WHERE policy_id = TRUE
       ORDER BY minimum_total ASC`,
    );

    return {
      policy: policyResult.rows[0],
      tiers: tiersResult.rows,
    };
  }

  async lockPolicy(client: PoolClient): Promise<PolicyRow | null> {
    const result = await client.query<PolicyRow>(
      `SELECT id, version, currency_code, updated_at, updated_by
       FROM purchase_approval_policy
       WHERE id = TRUE
       FOR UPDATE`,
    );
    return result.rows[0] ?? null;
  }

  async replaceTiersAndUpdate(
    client: PoolClient,
    actorId: string,
    tiers: ApprovalTierDto[],
  ): Promise<{ policy: PolicyRow; tiers: TierRow[] }> {
    // Delete existing tiers
    await client.query(`DELETE FROM purchase_approval_tiers WHERE policy_id = TRUE`);

    // Insert new tiers
    for (const tier of tiers) {
      await client.query(
        `INSERT INTO purchase_approval_tiers (policy_id, minimum_total, required_approvals)
         VALUES (TRUE, $1, $2)`,
        [tier.minimumTotal, tier.requiredApprovals],
      );
    }

    // Increment version, set updated_at and updated_by
    const updateResult = await client.query<PolicyRow>(
      `UPDATE purchase_approval_policy
       SET version = version + 1,
           updated_at = NOW(),
           updated_by = $1
       WHERE id = TRUE
       RETURNING id, version, currency_code, updated_at, updated_by`,
      [actorId],
    );

    const updatedTiers = await client.query<TierRow>(
      `SELECT id, policy_id, minimum_total, required_approvals
       FROM purchase_approval_tiers
       WHERE policy_id = TRUE
       ORDER BY minimum_total ASC`,
    );

    return {
      policy: updateResult.rows[0],
      tiers: updatedTiers.rows,
    };
  }
}

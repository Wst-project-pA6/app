import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';

export interface ReorderCandidateRow {
  store_id: string;
  part_id: string;
  part_sku: string;
  on_hand: number;
  reserved: number;
  min_level: number;
  max_level: number;
  open_po_quantity: number;
  average_weekly_consumption: string;
}

const CANDIDATE_LIMIT = 200;

/**
 * Read-only input gathering for the reorder rule baseline (WST-FR-14). Every query here only
 * ever SELECTs — see prediction-runs.service.ts for the hard "never mutate operational data"
 * invariant this repository must uphold: it has no insert/update/delete methods at all.
 */
@Injectable()
export class ReorderBaselineRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Candidates whose available stock plus already-open purchase order quantity is at or below
   * the part's min_level for that store — exactly the trigger condition the contract specifies.
   * Scoped to the caller's organization scopes (and, when given, a single storeId within them).
   */
  async findCandidates(scopeIds: string[], lookbackWeeks: number, storeId?: string): Promise<ReorderCandidateRow[]> {
    const params: unknown[] = [scopeIds, lookbackWeeks];
    let storeCondition = '';
    if (storeId) { params.push(storeId); storeCondition = `AND sb.store_id = $${params.length}`; }

    const result = await this.db.query<ReorderCandidateRow>(
      `SELECT sb.store_id, sb.part_id, p.sku AS part_sku, sb.on_hand, sb.reserved, sb.min_level, sb.max_level,
              COALESCE(open_po.qty, 0)::int AS open_po_quantity,
              COALESCE(consumption.weekly, 0)::text AS average_weekly_consumption
       FROM stock_balances sb
       JOIN stores s ON s.id = sb.store_id
       JOIN parts p ON p.id = sb.part_id
       LEFT JOIN LATERAL (
         SELECT SUM(pol.quantity_ordered - pol.quantity_accepted - pol.quantity_rejected) AS qty
         FROM purchase_order_lines pol
         JOIN purchase_orders po ON po.id = pol.purchase_order_id
         WHERE po.store_id = sb.store_id AND pol.part_id = sb.part_id
           AND po.status IN ('PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED')
       ) open_po ON TRUE
       LEFT JOIN LATERAL (
         SELECT ROUND(SUM(-sm.on_hand_delta)::numeric / $2, 2) AS weekly
         FROM stock_movements sm
         WHERE sm.store_id = sb.store_id AND sm.part_id = sb.part_id AND sm.type = 'ISSUE'
           AND sm.occurred_at >= now() - ($2::text || ' weeks')::interval
       ) consumption ON TRUE
       WHERE s.organization_scope_id = ANY($1::uuid[]) AND s.status = 'ACTIVE' AND p.status = 'ACTIVE'
         ${storeCondition}
         AND (sb.on_hand - sb.reserved) + COALESCE(open_po.qty, 0) <= sb.min_level
       ORDER BY sb.store_id, sb.part_id
       LIMIT ${CANDIDATE_LIMIT}`,
      params,
    );
    return result.rows;
  }
}

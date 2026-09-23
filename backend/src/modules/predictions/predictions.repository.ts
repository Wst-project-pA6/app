import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { PredictionListQuery } from './dto/prediction.dto';

export interface PredictionRow {
  id: string;
  type: 'REORDER_SUGGESTION' | 'TRAINING_RISK';
  status: 'ACTIVE' | 'ACCEPTED' | 'OVERRIDDEN' | 'DISMISSED' | 'SUPERSEDED';
  generated_at: Date;
  source_kind: 'RULE_BASELINE' | 'ML_MODEL';
  source_name: string;
  source_version: string;
  explanation_summary: string;
  explanation_factors: { code: string; message: string; value?: string }[];
  store_id: string | null;
  part_id: string | null;
  reorder_input: Record<string, unknown> | null;
  reorder_suggested_quantity: number | null;
  reorder_estimated_weeks_of_cover: string | null;
  student_id: string | null;
  course_id: string | null;
  risk_input: Record<string, unknown> | null;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  risk_flags: string[] | null;
  decision: 'ACCEPTED' | 'OVERRIDDEN' | 'DISMISSED' | null;
  decided_by: string | null;
  decided_at: Date | null;
  override_reason: string | null;
  override_quantity: number | null;
  decision_note: string | null;
  evaluation_outcome: 'PENDING' | 'CONFIRMED' | 'NOT_CONFIRMED' | 'NOT_APPLICABLE';
  evaluated_at: Date | null;
  evaluation_note: string | null;
}

const PREDICTION_SELECT = `
  p.id, p.type, p.status, p.generated_at, p.source_kind, p.source_name, p.source_version,
  p.explanation_summary, p.explanation_factors,
  p.store_id, p.part_id, p.reorder_input, p.reorder_suggested_quantity, p.reorder_estimated_weeks_of_cover,
  p.student_id, p.course_id, p.risk_input, p.risk_level, p.risk_flags,
  p.decision, p.decided_by, p.decided_at, p.override_reason, p.override_quantity, p.decision_note,
  p.evaluation_outcome, p.evaluated_at, p.evaluation_note`;

export interface ReorderInsert {
  storeId: string;
  partId: string;
  sourceKind: 'RULE_BASELINE' | 'ML_MODEL';
  sourceName: string;
  sourceVersion: string;
  explanationSummary: string;
  explanationFactors: { code: string; message: string; value?: string }[];
  input: Record<string, unknown>;
  suggestedQuantity: number;
  estimatedWeeksOfCover?: string;
}

export interface RiskInsert {
  studentId: string;
  courseId: string;
  sourceKind: 'RULE_BASELINE' | 'ML_MODEL';
  sourceName: string;
  sourceVersion: string;
  explanationSummary: string;
  explanationFactors: { code: string; message: string; value?: string }[];
  input: Record<string, unknown>;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  flags: string[];
}

/**
 * The ONLY repository predictions.service.ts / prediction-runs.service.ts write through — its
 * only write target is the `predictions` table itself (never job_cards, stock_balances,
 * invoices, enrollments, or any other module's tables). See
 * prediction-runs.service.spec.ts's "never mutates operational data" test, which asserts
 * exactly this.
 */
@Injectable()
export class PredictionsRepository {
  constructor(private readonly db: DatabaseService) {}

  async supersedeActiveReorder(client: PoolClient, storeId: string, partId: string): Promise<void> {
    await client.query(
      `UPDATE predictions SET status = 'SUPERSEDED'
       WHERE type = 'REORDER_SUGGESTION' AND status = 'ACTIVE' AND store_id = $1 AND part_id = $2`,
      [storeId, partId],
    );
  }

  async supersedeActiveRisk(client: PoolClient, studentId: string, courseId: string): Promise<void> {
    await client.query(
      `UPDATE predictions SET status = 'SUPERSEDED'
       WHERE type = 'TRAINING_RISK' AND status = 'ACTIVE' AND student_id = $1 AND course_id = $2`,
      [studentId, courseId],
    );
  }

  async insertReorder(client: PoolClient, data: ReorderInsert): Promise<PredictionRow> {
    const result = await client.query<PredictionRow>(
      `INSERT INTO predictions
         (type, status, source_kind, source_name, source_version, explanation_summary, explanation_factors,
          store_id, part_id, reorder_input, reorder_suggested_quantity, reorder_estimated_weeks_of_cover)
       VALUES ('REORDER_SUGGESTION', 'ACTIVE', $1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9, $10)
       RETURNING ${PREDICTION_SELECT}`,
      [
        data.sourceKind, data.sourceName, data.sourceVersion, data.explanationSummary,
        JSON.stringify(data.explanationFactors), data.storeId, data.partId, JSON.stringify(data.input),
        data.suggestedQuantity, data.estimatedWeeksOfCover ?? null,
      ],
    );
    return result.rows[0];
  }

  async insertRisk(client: PoolClient, data: RiskInsert): Promise<PredictionRow> {
    const result = await client.query<PredictionRow>(
      `INSERT INTO predictions
         (type, status, source_kind, source_name, source_version, explanation_summary, explanation_factors,
          student_id, course_id, risk_input, risk_level, risk_flags)
       VALUES ('TRAINING_RISK', 'ACTIVE', $1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9, $10::jsonb)
       RETURNING ${PREDICTION_SELECT}`,
      [
        data.sourceKind, data.sourceName, data.sourceVersion, data.explanationSummary,
        JSON.stringify(data.explanationFactors), data.studentId, data.courseId, JSON.stringify(data.input),
        data.riskLevel, JSON.stringify(data.flags),
      ],
    );
    return result.rows[0];
  }

  /** Scope-safe single-row lookup used by both get() and decide() — a row outside the caller's readable set never resolves. */
  async findScoped(
    predictionId: string,
    scopeIds: string[],
    canReadReorder: boolean,
    canReadRisk: boolean,
    mentorUserId: string | undefined,
    client?: PoolClient,
    lock = false,
  ): Promise<PredictionRow | null> {
    if (!canReadReorder && !canReadRisk) return null;
    const params: unknown[] = [scopeIds];
    const scopeBranch = this.scopeBranch(canReadReorder, canReadRisk, mentorUserId, params);
    params.push(predictionId);
    const sql = `SELECT ${PREDICTION_SELECT}
       FROM predictions p
       LEFT JOIN stores s ON s.id = p.store_id
       LEFT JOIN courses c ON c.id = p.course_id
       WHERE p.id = $${params.length} AND (${scopeBranch})
       ${lock ? 'FOR UPDATE OF p' : ''}`;
    const result = client ? await client.query<PredictionRow>(sql, params) : await this.db.query<PredictionRow>(sql, params);
    return result.rows[0] ?? null;
  }

  async list(
    query: PredictionListQuery,
    scopeIds: string[],
    canReadReorder: boolean,
    canReadRisk: boolean,
    mentorUserId: string | undefined,
  ): Promise<{ rows: PredictionRow[]; totalItems: number }> {
    if (!canReadReorder && !canReadRisk) return { rows: [], totalItems: 0 };

    const params: unknown[] = [scopeIds];
    const scopeBranch = this.scopeBranch(canReadReorder, canReadRisk, mentorUserId, params);
    const conditions = [`(${scopeBranch})`];
    const add = (sql: string, value: unknown): void => {
      params.push(value);
      conditions.push(sql.replace('?', `$${params.length}`));
    };
    if (query.from) add('p.generated_at >= ?::timestamptz', query.from);
    if (query.to) add('p.generated_at < ?::timestamptz', query.to);
    if (query.type) add('p.type = ?', query.type);
    if (query.status) add('p.status = ?', query.status);
    if (query.storeId) add('p.store_id = ?', query.storeId);
    if (query.partId) add('p.part_id = ?', query.partId);
    if (query.studentId) add('p.student_id = ?', query.studentId);
    if (query.courseId) add('p.course_id = ?', query.courseId);
    if (query.riskLevel) add('p.risk_level = ?', query.riskLevel);

    const where = `WHERE ${conditions.join(' AND ')}`;
    const direction = (query.sort ?? '-generatedAt').startsWith('-') ? 'DESC' : 'ASC';
    const field = (query.sort ?? '-generatedAt').replace(/^-/, '');
    if (field !== 'generatedAt') throw new Error('INVALID_SORT');

    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count
       FROM predictions p LEFT JOIN stores s ON s.id = p.store_id LEFT JOIN courses c ON c.id = p.course_id
       ${where}`,
      params,
    );
    const rows = await this.db.query<PredictionRow>(
      `SELECT ${PREDICTION_SELECT}
       FROM predictions p LEFT JOIN stores s ON s.id = p.store_id LEFT JOIN courses c ON c.id = p.course_id
       ${where}
       ORDER BY p.generated_at ${direction}, p.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }

  async recordDecision(
    client: PoolClient,
    predictionId: string,
    data: {
      status: 'ACCEPTED' | 'OVERRIDDEN' | 'DISMISSED';
      decidedBy: string;
      overrideReason?: string;
      overrideQuantity?: number;
      note?: string;
    },
  ): Promise<PredictionRow> {
    const result = await client.query<PredictionRow>(
      `UPDATE predictions
       SET status = $2, decision = $2, decided_by = $3, decided_at = now(),
           override_reason = $4, override_quantity = $5, decision_note = $6
       WHERE id = $1
       RETURNING ${PREDICTION_SELECT}`,
      [predictionId, data.status, data.decidedBy, data.overrideReason ?? null, data.overrideQuantity ?? null, data.note ?? null],
    );
    return result.rows[0];
  }

  /** OR-combines the readable-type branches (reorder via stores scope, risk via courses scope, optionally mentor-restricted), never widening beyond what the caller may read. */
  private scopeBranch(
    canReadReorder: boolean,
    canReadRisk: boolean,
    mentorUserId: string | undefined,
    params: unknown[],
  ): string {
    const branches: string[] = [];
    if (canReadReorder) {
      branches.push(`(p.type = 'REORDER_SUGGESTION' AND s.organization_scope_id = ANY($1::uuid[]))`);
    }
    if (canReadRisk) {
      let mentorCondition = '';
      if (mentorUserId) {
        params.push(mentorUserId);
        mentorCondition = ` AND EXISTS (
          SELECT 1 FROM enrollments e JOIN training_sessions ts ON ts.group_id = e.group_id
          WHERE e.student_id = p.student_id AND e.course_id = p.course_id AND ts.mentor_id = $${params.length}
        )`;
      }
      branches.push(`(p.type = 'TRAINING_RISK' AND c.organization_scope_id = ANY($1::uuid[])${mentorCondition})`);
    }
    return branches.length > 0 ? branches.join(' OR ') : 'FALSE';
  }
}

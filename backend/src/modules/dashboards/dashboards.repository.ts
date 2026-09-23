import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { ReportFiltersDto } from '../../common/reports/report-filters.dto';
import { DateWindow } from '../../common/reports/resolve-window.util';
import { RawMetric } from './dto/dashboard.dto';

/**
 * Every query below is a direct aggregation over the transactional tables the OpenAPI contract
 * names for each dashboard (job_cards/labor_entries/quality_checks for workshop,
 * stock_balances/stock_movements/purchase_orders/invoices for inventory-finance,
 * attendance_records/assessments/certificates for training, predictions/prediction_runs for
 * ai-data) — never a guessed or pre-aggregated number. All percentages/sums/averages are
 * computed with PostgreSQL NUMERIC arithmetic and returned as text (DecimalString), never
 * converted through a JS float. Row scope is always `organization_scope_id = ANY($1::uuid[])`
 * against the caller's already-resolved effective scope (see resolve-scope-ids.util.ts) —
 * exactly the pattern used by every other repository's list()/findScoped() methods.
 */
@Injectable()
export class DashboardsRepository {
  constructor(private readonly db: DatabaseService) {}

  async getWorkshopMetrics(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric[]> {
    const [jobsByStage, turnaround, rework, laborHours, bayUtilization, technicianUtilization] = await Promise.all([
      this.jobsByStage(scopeIds, window, filters),
      this.turnaroundHours(scopeIds, window, filters),
      this.reworkRate(scopeIds, window, filters),
      this.laborHours(scopeIds, window, filters),
      this.bayUtilization(scopeIds, window, filters),
      this.technicianUtilization(scopeIds, window, filters),
    ]);
    return [jobsByStage, turnaround, rework, laborHours, bayUtilization, technicianUtilization];
  }

  private async jobsByStage(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    const conditions: string[] = [];
    if (filters.bayId) { params.push(filters.bayId); conditions.push(`j.bay_id = $${params.length}`); }
    if (filters.technicianId) { params.push(filters.technicianId); conditions.push(`j.technician_id = $${params.length}`); }
    const result = await this.db.query<{ stage: string; cnt: number }>(
      `SELECT j.stage, count(*)::int AS cnt
       FROM job_cards j
       WHERE j.organization_scope_id = ANY($1::uuid[])
         AND j.created_at >= $2::timestamptz AND j.created_at < $3::timestamptz
         ${conditions.map((c) => `AND ${c}`).join(' ')}
       GROUP BY j.stage`,
      params,
    );
    const total = result.rows.reduce((sum, row) => sum + row.cnt, 0);
    return {
      key: 'JOBS_BY_STAGE',
      unit: 'COUNT',
      value: String(total),
      recordCount: total,
      breakdown: result.rows.map((row) => ({ key: row.stage, label: row.stage, value: String(row.cnt), recordCount: row.cnt })),
    };
  }

  private async turnaroundHours(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    const conditions: string[] = [];
    if (filters.bayId) { params.push(filters.bayId); conditions.push(`j.bay_id = $${params.length}`); }
    if (filters.technicianId) { params.push(filters.technicianId); conditions.push(`j.technician_id = $${params.length}`); }
    const row = await this.db.queryOne<{ cnt: number; avg_hours: string }>(
      `SELECT count(*)::int AS cnt,
              COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (j.delivered_at - j.created_at)) / 3600.0)::numeric, 2), 0)::text AS avg_hours
       FROM job_cards j
       WHERE j.organization_scope_id = ANY($1::uuid[])
         AND j.stage = 'DELIVERED' AND j.delivered_at IS NOT NULL
         AND j.delivered_at >= $2::timestamptz AND j.delivered_at < $3::timestamptz
         ${conditions.map((c) => `AND ${c}`).join(' ')}`,
      params,
    );
    return { key: 'TURNAROUND_HOURS', unit: 'HOURS', value: row?.avg_hours ?? '0', recordCount: row?.cnt ?? 0 };
  }

  private async reworkRate(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    const conditions: string[] = [];
    if (filters.bayId) { params.push(filters.bayId); conditions.push(`j.bay_id = $${params.length}`); }
    if (filters.technicianId) { params.push(filters.technicianId); conditions.push(`j.technician_id = $${params.length}`); }
    const row = await this.db.queryOne<{ total: number; rate: string }>(
      `WITH qc AS (
         SELECT q.job_id, bool_or(q.result = 'FAILED') AS had_failure
         FROM quality_checks q
         JOIN job_cards j ON j.id = q.job_id
         WHERE j.organization_scope_id = ANY($1::uuid[])
           AND q.performed_at >= $2::timestamptz AND q.performed_at < $3::timestamptz
           ${conditions.map((c) => `AND ${c}`).join(' ')}
         GROUP BY q.job_id
       )
       SELECT count(*)::int AS total,
              COALESCE(ROUND(100.0 * count(*) FILTER (WHERE had_failure) / NULLIF(count(*), 0), 2), 0)::text AS rate
       FROM qc`,
      params,
    );
    return { key: 'REWORK_RATE', unit: 'PERCENT', value: row?.rate ?? '0', recordCount: row?.total ?? 0 };
  }

  private async laborHours(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric> {
    const { row } = await this.laborHoursQuery(scopeIds, window, filters);
    return { key: 'LABOR_HOURS', unit: 'HOURS', value: row?.hours ?? '0', recordCount: row?.cnt ?? 0 };
  }

  private async laborHoursQuery(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto) {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    const conditions: string[] = [];
    if (filters.bayId) { params.push(filters.bayId); conditions.push(`j.bay_id = $${params.length}`); }
    if (filters.technicianId) { params.push(filters.technicianId); conditions.push(`le.technician_id = $${params.length}`); }
    const row = await this.db.queryOne<{ cnt: number; hours: string }>(
      `SELECT count(*)::int AS cnt,
              COALESCE(ROUND(SUM(le.duration_minutes)::numeric / 60.0, 2), 0)::text AS hours
       FROM labor_entries le
       JOIN job_cards j ON j.id = le.job_id
       WHERE j.organization_scope_id = ANY($1::uuid[])
         AND le.status = 'ACTIVE'
         AND le.work_date >= $2::timestamptz::date AND le.work_date < $3::timestamptz::date
         ${conditions.map((c) => `AND ${c}`).join(' ')}`,
      params,
    );
    return { row };
  }

  private async bayUtilization(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    let bayCondition = '';
    if (filters.bayId) { params.push(filters.bayId); bayCondition = `AND b.id = $${params.length}`; }
    let jobBayCondition = '';
    if (filters.bayId) { jobBayCondition = `AND j.bay_id = $${params.length}`; }
    const row = await this.db.queryOne<{ job_count: number; utilization: string }>(
      `WITH bays_in_scope AS (
         SELECT count(*)::int AS n FROM bays b
         WHERE b.organization_scope_id = ANY($1::uuid[]) ${bayCondition}
       ),
       overlap AS (
         SELECT
           COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (
             LEAST(j.expected_completion_at, $3::timestamptz) - GREATEST(j.scheduled_start_at, $2::timestamptz)
           )) / 3600.0)), 0) AS hours,
           count(*)::int AS cnt
         FROM job_cards j
         WHERE j.organization_scope_id = ANY($1::uuid[])
           AND j.bay_id IS NOT NULL
           AND j.scheduled_start_at IS NOT NULL AND j.expected_completion_at IS NOT NULL
           AND j.scheduled_start_at < $3::timestamptz AND j.expected_completion_at > $2::timestamptz
           ${jobBayCondition}
       )
       SELECT overlap.cnt AS job_count,
              COALESCE(ROUND(LEAST(100.0, 100.0 * overlap.hours /
                NULLIF(bays_in_scope.n * (EXTRACT(EPOCH FROM ($3::timestamptz - $2::timestamptz)) / 3600.0), 0))::numeric, 2), 0)::text AS utilization
       FROM bays_in_scope, overlap`,
      params,
    );
    return { key: 'BAY_UTILIZATION', unit: 'PERCENT', value: row?.utilization ?? '0', recordCount: row?.job_count ?? 0 };
  }

  private async technicianUtilization(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    const conditions: string[] = [];
    if (filters.bayId) { params.push(filters.bayId); conditions.push(`j.bay_id = $${params.length}`); }
    if (filters.technicianId) { params.push(filters.technicianId); conditions.push(`le.technician_id = $${params.length}`); }
    const row = await this.db.queryOne<{ technician_count: number; utilization: string }>(
      `WITH tech AS (
         SELECT le.technician_id, SUM(le.duration_minutes) AS minutes
         FROM labor_entries le
         JOIN job_cards j ON j.id = le.job_id
         WHERE j.organization_scope_id = ANY($1::uuid[])
           AND le.status = 'ACTIVE'
           AND le.work_date >= $2::timestamptz::date AND le.work_date < $3::timestamptz::date
           ${conditions.map((c) => `AND ${c}`).join(' ')}
         GROUP BY le.technician_id
       )
       SELECT count(*)::int AS technician_count,
              COALESCE(ROUND(LEAST(100.0, 100.0 * (COALESCE(SUM(minutes), 0)::numeric / 60.0) /
                NULLIF(count(*) * (EXTRACT(EPOCH FROM ($3::timestamptz - $2::timestamptz)) / 3600.0), 0))::numeric, 2), 0)::text AS utilization
       FROM tech`,
      params,
    );
    return {
      key: 'TECHNICIAN_UTILIZATION',
      unit: 'PERCENT',
      value: row?.utilization ?? '0',
      recordCount: row?.technician_count ?? 0,
    };
  }

  async getInventoryFinanceMetrics(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric[]> {
    const [stockAccuracy, stockouts, turnover, leadTime, invoiceVariance, aging] = await Promise.all([
      this.stockAccuracy(scopeIds, filters),
      this.stockouts(scopeIds, filters),
      this.inventoryTurnover(scopeIds, window, filters),
      this.purchaseLeadTime(scopeIds, window, filters),
      this.invoiceVariance(scopeIds, window),
      this.agingReferences(scopeIds),
    ]);
    return [stockAccuracy, stockouts, turnover, leadTime, invoiceVariance, aging];
  }

  private async stockAccuracy(scopeIds: string[], filters: ReportFiltersDto): Promise<RawMetric> {
    const params: unknown[] = [scopeIds];
    let storeCondition = '';
    if (filters.storeId) { params.push(filters.storeId); storeCondition = `AND s.id = $${params.length}`; }
    const row = await this.db.queryOne<{ total: number; accuracy: string }>(
      `WITH ledger AS (
         SELECT sm.store_id, sm.part_id, COALESCE(SUM(sm.on_hand_delta), 0)::int AS ledger_on_hand
         FROM stock_movements sm
         JOIN stores s ON s.id = sm.store_id
         WHERE s.organization_scope_id = ANY($1::uuid[]) ${storeCondition}
         GROUP BY sm.store_id, sm.part_id
       ),
       balances AS (
         SELECT sb.store_id, sb.part_id, sb.on_hand
         FROM stock_balances sb
         JOIN stores s ON s.id = sb.store_id
         WHERE s.organization_scope_id = ANY($1::uuid[]) ${storeCondition}
       )
       SELECT count(*)::int AS total,
              COALESCE(ROUND(100.0 * count(*) FILTER (WHERE COALESCE(l.ledger_on_hand, 0) = b.on_hand) / NULLIF(count(*), 0), 2), 0)::text AS accuracy
       FROM balances b
       LEFT JOIN ledger l ON l.store_id = b.store_id AND l.part_id = b.part_id`,
      params,
    );
    return {
      key: 'STOCK_ACCURACY',
      unit: 'PERCENT',
      value: row?.accuracy ?? '0',
      recordCount: row?.total ?? 0,
      requiresPermission: 'inventory.read',
    };
  }

  private async stockouts(scopeIds: string[], filters: ReportFiltersDto): Promise<RawMetric> {
    const params: unknown[] = [scopeIds];
    let storeCondition = '';
    if (filters.storeId) { params.push(filters.storeId); storeCondition = `AND sb.store_id = $${params.length}`; }
    const row = await this.db.queryOne<{ total: number; stockouts: number }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE sb.on_hand = 0)::int AS stockouts
       FROM stock_balances sb
       JOIN stores s ON s.id = sb.store_id
       WHERE s.organization_scope_id = ANY($1::uuid[]) ${storeCondition}`,
      params,
    );
    return {
      key: 'STOCKOUTS',
      unit: 'COUNT',
      value: String(row?.stockouts ?? 0),
      recordCount: row?.total ?? 0,
      requiresPermission: 'inventory.read',
    };
  }

  private async inventoryTurnover(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    let storeCondition = '';
    if (filters.storeId) { params.push(filters.storeId); storeCondition = `AND s.id = $${params.length}`; }
    const row = await this.db.queryOne<{ cnt: number; turnover: string }>(
      `WITH issued AS (
         SELECT COALESCE(SUM((pi.quantity - pi.reversed_quantity) * COALESCE(pi.unit_cost_amount, 0)), 0) AS cost, count(*)::int AS cnt
         FROM part_issues pi
         JOIN stores s ON s.id = pi.store_id
         WHERE s.organization_scope_id = ANY($1::uuid[])
           AND pi.created_at >= $2::timestamptz AND pi.created_at < $3::timestamptz
           ${storeCondition}
       ),
       inv_value AS (
         SELECT COALESCE(SUM(sb.on_hand * sb.average_cost_amount), 0) AS value
         FROM stock_balances sb
         JOIN stores s ON s.id = sb.store_id
         WHERE s.organization_scope_id = ANY($1::uuid[]) ${storeCondition}
       )
       SELECT issued.cnt, COALESCE(ROUND(issued.cost / NULLIF(inv_value.value, 0), 4), 0)::text AS turnover
       FROM issued, inv_value`,
      params,
    );
    return {
      key: 'INVENTORY_TURNOVER',
      unit: 'RATIO',
      value: row?.turnover ?? '0',
      recordCount: row?.cnt ?? 0,
      requiresPermission: 'inventory.cost.read',
    };
  }

  private async purchaseLeadTime(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    let storeCondition = '';
    if (filters.storeId) { params.push(filters.storeId); storeCondition = `AND po.store_id = $${params.length}`; }
    const row = await this.db.queryOne<{ cnt: number; lead_time_days: string }>(
      `WITH first_receipt AS (
         SELECT gr.purchase_order_id, MIN(gr.received_at) AS received_at
         FROM goods_receipts gr
         GROUP BY gr.purchase_order_id
       )
       SELECT count(*)::int AS cnt,
              COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (fr.received_at - po.submitted_at)) / 86400.0)::numeric, 2), 0)::text AS lead_time_days
       FROM purchase_orders po
       JOIN first_receipt fr ON fr.purchase_order_id = po.id
       JOIN stores s ON s.id = po.store_id
       WHERE s.organization_scope_id = ANY($1::uuid[])
         AND po.submitted_at IS NOT NULL
         AND fr.received_at >= $2::timestamptz AND fr.received_at < $3::timestamptz
         ${storeCondition}`,
      params,
    );
    return {
      key: 'PURCHASE_LEAD_TIME_DAYS',
      unit: 'DAYS',
      value: row?.lead_time_days ?? '0',
      recordCount: row?.cnt ?? 0,
      requiresPermission: 'purchasing.read',
    };
  }

  private async invoiceVariance(scopeIds: string[], window: DateWindow): Promise<RawMetric> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    const row = await this.db.queryOne<{ cnt: number; variance: string; currency_code: string | null }>(
      `WITH approved_est AS (
         SELECT ja.job_id, COALESCE(SUM(ja.estimated_amount), 0) AS amt
         FROM job_approvals ja
         WHERE ja.status = 'APPROVED'
         GROUP BY ja.job_id
       )
       SELECT count(*)::int AS cnt,
              COALESCE(SUM(i.total_amount - COALESCE(ae.amt, 0)), 0)::text AS variance,
              (SELECT currency_code FROM finance_settings LIMIT 1) AS currency_code
       FROM invoices i
       JOIN job_cards j ON j.id = i.job_id
       LEFT JOIN approved_est ae ON ae.job_id = i.job_id
       WHERE j.organization_scope_id = ANY($1::uuid[])
         AND i.status IN ('ISSUED', 'PAID')
         AND i.issued_at >= $2::timestamptz AND i.issued_at < $3::timestamptz`,
      params,
    );
    return {
      key: 'INVOICE_VARIANCE',
      unit: 'MONEY',
      value: row?.variance ?? '0',
      currencyCode: row?.currency_code ?? undefined,
      recordCount: row?.cnt ?? 0,
      requiresPermission: 'invoices.read',
    };
  }

  private async agingReferences(scopeIds: string[]): Promise<RawMetric> {
    const row = await this.db.queryOne<{
      total: number; b0_30: number; b31_60: number; b61_90: number; b90plus: number;
    }>(
      `SELECT
         count(*)::int AS total,
         count(*) FILTER (WHERE now() - i.issued_at < interval '30 days')::int AS b0_30,
         count(*) FILTER (WHERE now() - i.issued_at >= interval '30 days' AND now() - i.issued_at < interval '60 days')::int AS b31_60,
         count(*) FILTER (WHERE now() - i.issued_at >= interval '60 days' AND now() - i.issued_at < interval '90 days')::int AS b61_90,
         count(*) FILTER (WHERE now() - i.issued_at >= interval '90 days')::int AS b90plus
       FROM invoices i
       JOIN job_cards j ON j.id = i.job_id
       WHERE j.organization_scope_id = ANY($1::uuid[]) AND i.status = 'ISSUED'`,
      [scopeIds],
    );
    const total = row?.total ?? 0;
    return {
      key: 'AGING_REFERENCES',
      unit: 'COUNT',
      value: String(total),
      recordCount: total,
      requiresPermission: 'invoices.read',
      breakdown: [
        { key: '0-30', label: '0-30 days', value: String(row?.b0_30 ?? 0), recordCount: row?.b0_30 ?? 0 },
        { key: '31-60', label: '31-60 days', value: String(row?.b31_60 ?? 0), recordCount: row?.b31_60 ?? 0 },
        { key: '61-90', label: '61-90 days', value: String(row?.b61_90 ?? 0), recordCount: row?.b61_90 ?? 0 },
        { key: '90+', label: '90+ days', value: String(row?.b90plus ?? 0), recordCount: row?.b90plus ?? 0 },
      ],
    };
  }

  async getTrainingMetrics(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric[]> {
    const [attendance, completion, passAndNeedsImprovement, coverage, certificates] = await Promise.all([
      this.attendanceRate(scopeIds, window, filters),
      this.assessmentCompletionRate(scopeIds, window, filters),
      this.passAndNeedsImprovementRate(scopeIds, window, filters),
      this.competencyCoverage(scopeIds, window, filters),
      this.certificatesIssued(scopeIds, window, filters),
    ]);
    return [attendance, completion, ...passAndNeedsImprovement, coverage, certificates];
  }

  private courseFilterConditions(filters: ReportFiltersDto, params: unknown[], alias: string): string[] {
    const conditions: string[] = [];
    if (filters.courseId) { params.push(filters.courseId); conditions.push(`${alias}.id = $${params.length}`); }
    if (filters.termId) { params.push(filters.termId); conditions.push(`${alias}.term_id = $${params.length}`); }
    return conditions;
  }

  private async attendanceRate(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    const conditions = this.courseFilterConditions(filters, params, 'c');
    const row = await this.db.queryOne<{ total: number; rate: string }>(
      `SELECT count(*)::int AS total,
              COALESCE(ROUND(100.0 * count(*) FILTER (WHERE ar.status IN ('PRESENT', 'LATE')) / NULLIF(count(*), 0), 2), 0)::text AS rate
       FROM attendance_records ar
       JOIN training_sessions ts ON ts.id = ar.session_id
       JOIN courses c ON c.id = ts.course_id
       WHERE c.organization_scope_id = ANY($1::uuid[])
         AND ts.starts_at >= $2::timestamptz AND ts.starts_at < $3::timestamptz
         ${conditions.map((c2) => `AND ${c2}`).join(' ')}`,
      params,
    );
    return { key: 'ATTENDANCE_RATE', unit: 'PERCENT', value: row?.rate ?? '0', recordCount: row?.total ?? 0 };
  }

  private async assessmentCompletionRate(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    const conditions = this.courseFilterConditions(filters, params, 'c');
    const row = await this.db.queryOne<{ total: number; rate: string }>(
      `SELECT count(*)::int AS total,
              COALESCE(ROUND(100.0 * count(*) FILTER (WHERE a.sign_off_status = 'SIGNED_OFF') / NULLIF(count(*), 0), 2), 0)::text AS rate
       FROM assessments a
       JOIN courses c ON c.id = a.course_id
       WHERE c.organization_scope_id = ANY($1::uuid[])
         AND a.assessed_at >= $2::timestamptz AND a.assessed_at < $3::timestamptz
         ${conditions.map((c2) => `AND ${c2}`).join(' ')}`,
      params,
    );
    return { key: 'ASSESSMENT_COMPLETION_RATE', unit: 'PERCENT', value: row?.rate ?? '0', recordCount: row?.total ?? 0 };
  }

  private async passAndNeedsImprovementRate(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric[]> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    const conditions = this.courseFilterConditions(filters, params, 'c');
    const row = await this.db.queryOne<{ total: number; pass_rate: string; needs_improvement_rate: string }>(
      `SELECT count(*)::int AS total,
              COALESCE(ROUND(100.0 * count(*) FILTER (WHERE a.result = 'PASS') / NULLIF(count(*), 0), 2), 0)::text AS pass_rate,
              COALESCE(ROUND(100.0 * count(*) FILTER (WHERE a.result = 'NEEDS_IMPROVEMENT') / NULLIF(count(*), 0), 2), 0)::text AS needs_improvement_rate
       FROM assessments a
       JOIN courses c ON c.id = a.course_id
       WHERE c.organization_scope_id = ANY($1::uuid[])
         AND a.sign_off_status = 'SIGNED_OFF'
         AND a.assessed_at >= $2::timestamptz AND a.assessed_at < $3::timestamptz
         ${conditions.map((c2) => `AND ${c2}`).join(' ')}`,
      params,
    );
    const total = row?.total ?? 0;
    return [
      { key: 'PASS_RATE', unit: 'PERCENT', value: row?.pass_rate ?? '0', recordCount: total },
      { key: 'NEEDS_IMPROVEMENT_RATE', unit: 'PERCENT', value: row?.needs_improvement_rate ?? '0', recordCount: total },
    ];
  }

  private async competencyCoverage(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric> {
    const params: unknown[] = [scopeIds];
    const conditions = this.courseFilterConditions(filters, params, 'c');
    params.push(window.from.toISOString(), window.to.toISOString());
    const fromParam = `$${params.length - 1}`;
    const toParam = `$${params.length}`;
    const row = await this.db.queryOne<{ denominator: number; numerator: number; coverage: string }>(
      `WITH scope_courses AS (
         SELECT c.id FROM courses c
         WHERE c.organization_scope_id = ANY($1::uuid[]) ${conditions.map((c2) => `AND ${c2}`).join(' ')}
       ),
       required_tasks AS (
         SELECT ct.course_id, count(*)::int AS required_count
         FROM course_tasks ct
         WHERE ct.required = TRUE AND ct.course_id IN (SELECT id FROM scope_courses)
         GROUP BY ct.course_id
       ),
       active_enrollments AS (
         SELECT e.course_id, count(*)::int AS enrolled_count
         FROM enrollments e
         WHERE e.status = 'ACTIVE' AND e.course_id IN (SELECT id FROM scope_courses)
         GROUP BY e.course_id
       ),
       denom AS (
         SELECT COALESCE(SUM(rt.required_count * COALESCE(ae.enrolled_count, 0)), 0)::int AS denominator
         FROM required_tasks rt
         LEFT JOIN active_enrollments ae ON ae.course_id = rt.course_id
       ),
       numer AS (
         SELECT count(DISTINCT (a.student_id, a.task_id))::int AS numerator
         FROM assessments a
         WHERE a.course_id IN (SELECT id FROM scope_courses)
           AND a.counts_toward_completion = TRUE
           AND a.assessed_at >= ${fromParam}::timestamptz AND a.assessed_at < ${toParam}::timestamptz
       )
       SELECT denom.denominator, numer.numerator,
              COALESCE(ROUND(100.0 * numer.numerator / NULLIF(denom.denominator, 0), 2), 0)::text AS coverage
       FROM denom, numer`,
      params,
    );
    return {
      key: 'COMPETENCY_COVERAGE',
      unit: 'PERCENT',
      value: row?.coverage ?? '0',
      recordCount: row?.numerator ?? 0,
    };
  }

  private async certificatesIssued(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    const conditions = this.courseFilterConditions(filters, params, 'c');
    const row = await this.db.queryOne<{ total: number }>(
      `SELECT count(*)::int AS total
       FROM certificates cert
       JOIN courses c ON c.id = cert.course_id
       WHERE c.organization_scope_id = ANY($1::uuid[])
         AND cert.status = 'ISSUED'
         AND cert.issued_at >= $2::timestamptz AND cert.issued_at < $3::timestamptz
         ${conditions.map((c2) => `AND ${c2}`).join(' ')}`,
      params,
    );
    const total = row?.total ?? 0;
    return { key: 'CERTIFICATES_ISSUED', unit: 'COUNT', value: String(total), recordCount: total };
  }

  async getAiDataMetrics(
    scopeIds: string[],
    window: DateWindow,
    filters: ReportFiltersDto,
    canReadReorder: boolean,
    canReadRisk: boolean,
  ): Promise<RawMetric[]> {
    const metrics: RawMetric[] = [];
    if (canReadReorder) {
      const [rates, forecast] = await Promise.all([
        this.reorderRates(scopeIds, window, filters),
        this.forecastEvaluation(scopeIds, window, filters),
      ]);
      metrics.push(...rates);
      if (forecast) metrics.push(forecast);
    }
    if (canReadRisk) {
      const riskEvaluation = await this.trainingRiskEvaluation(scopeIds, window, filters);
      if (riskEvaluation) metrics.push(riskEvaluation);
    }
    const [missing, late] = await Promise.all([
      this.missingDataCount(scopeIds, window, filters, canReadReorder, canReadRisk),
      this.lateDataCount(window, canReadReorder, canReadRisk),
    ]);
    if (missing) metrics.push(missing);
    if (late) metrics.push(late);
    return metrics;
  }

  private async reorderRates(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric[]> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    let storeCondition = '';
    if (filters.storeId) { params.push(filters.storeId); storeCondition = `AND p.store_id = $${params.length}`; }
    const row = await this.db.queryOne<{ total: number; acceptance_rate: string; override_rate: string }>(
      `SELECT count(*)::int AS total,
              COALESCE(ROUND(100.0 * count(*) FILTER (WHERE p.decision = 'ACCEPTED') / NULLIF(count(*), 0), 2), 0)::text AS acceptance_rate,
              COALESCE(ROUND(100.0 * count(*) FILTER (WHERE p.decision = 'OVERRIDDEN') / NULLIF(count(*), 0), 2), 0)::text AS override_rate
       FROM predictions p
       JOIN stores s ON s.id = p.store_id
       WHERE p.type = 'REORDER_SUGGESTION' AND p.status <> 'ACTIVE'
         AND s.organization_scope_id = ANY($1::uuid[])
         AND p.decided_at >= $2::timestamptz AND p.decided_at < $3::timestamptz
         ${storeCondition}`,
      params,
    );
    const total = row?.total ?? 0;
    return [
      { key: 'REORDER_ACCEPTANCE_RATE', unit: 'PERCENT', value: row?.acceptance_rate ?? '0', recordCount: total },
      { key: 'REORDER_OVERRIDE_RATE', unit: 'PERCENT', value: row?.override_rate ?? '0', recordCount: total },
    ];
  }

  private async forecastEvaluation(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric | null> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    let storeCondition = '';
    if (filters.storeId) { params.push(filters.storeId); storeCondition = `AND p.store_id = $${params.length}`; }
    const row = await this.db.queryOne<{ evaluated: number; rate: string }>(
      `SELECT count(*)::int AS evaluated,
              COALESCE(ROUND(100.0 * count(*) FILTER (WHERE p.evaluation_outcome = 'CONFIRMED') / NULLIF(count(*), 0), 2), 0)::text AS rate
       FROM predictions p
       JOIN stores s ON s.id = p.store_id
       WHERE p.type = 'REORDER_SUGGESTION' AND p.evaluation_outcome IN ('CONFIRMED', 'NOT_CONFIRMED')
         AND s.organization_scope_id = ANY($1::uuid[])
         AND p.evaluated_at >= $2::timestamptz AND p.evaluated_at < $3::timestamptz
         ${storeCondition}`,
      params,
    );
    if (!row || row.evaluated === 0) return null; // "where applicable" — omitted when there is nothing evaluated yet
    return { key: 'FORECAST_EVALUATION', unit: 'PERCENT', value: row.rate, recordCount: row.evaluated };
  }

  private async trainingRiskEvaluation(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<RawMetric | null> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    const conditions = this.courseFilterConditions(filters, params, 'c');
    const row = await this.db.queryOne<{ evaluated: number; rate: string }>(
      `SELECT count(*)::int AS evaluated,
              COALESCE(ROUND(100.0 * count(*) FILTER (WHERE p.evaluation_outcome = 'CONFIRMED') / NULLIF(count(*), 0), 2), 0)::text AS rate
       FROM predictions p
       JOIN courses c ON c.id = p.course_id
       WHERE p.type = 'TRAINING_RISK' AND p.evaluation_outcome IN ('CONFIRMED', 'NOT_CONFIRMED')
         AND c.organization_scope_id = ANY($1::uuid[])
         AND p.evaluated_at >= $2::timestamptz AND p.evaluated_at < $3::timestamptz
         ${conditions.map((c2) => `AND ${c2}`).join(' ')}`,
      params,
    );
    if (!row || row.evaluated === 0) return null;
    return { key: 'TRAINING_RISK_EVALUATION', unit: 'PERCENT', value: row.rate, recordCount: row.evaluated };
  }

  private async missingDataCount(
    scopeIds: string[],
    window: DateWindow,
    filters: ReportFiltersDto,
    canReadReorder: boolean,
    canReadRisk: boolean,
  ): Promise<RawMetric | null> {
    if (!canReadReorder && !canReadRisk) return null;
    let count = 0;
    if (canReadReorder) {
      const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
      let storeCondition = '';
      if (filters.storeId) { params.push(filters.storeId); storeCondition = `AND p.store_id = $${params.length}`; }
      count += await this.db.queryValue<number>(
        `SELECT count(*)::int FROM predictions p
         JOIN stores s ON s.id = p.store_id
         WHERE p.type = 'REORDER_SUGGESTION' AND p.reorder_input IS NULL
           AND s.organization_scope_id = ANY($1::uuid[])
           AND p.generated_at >= $2::timestamptz AND p.generated_at < $3::timestamptz
           ${storeCondition}`,
        params,
      ) ?? 0;
    }
    if (canReadRisk) {
      const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
      const conditions = this.courseFilterConditions(filters, params, 'c');
      count += await this.db.queryValue<number>(
        `SELECT count(*)::int FROM predictions p
         JOIN courses c ON c.id = p.course_id
         WHERE p.type = 'TRAINING_RISK' AND p.risk_input IS NULL
           AND c.organization_scope_id = ANY($1::uuid[])
           AND p.generated_at >= $2::timestamptz AND p.generated_at < $3::timestamptz
           ${conditions.map((c2) => `AND ${c2}`).join(' ')}`,
        params,
      ) ?? 0;
    }
    return { key: 'MISSING_DATA_COUNT', unit: 'COUNT', value: String(count), recordCount: count };
  }

  private async lateDataCount(window: DateWindow, canReadReorder: boolean, canReadRisk: boolean): Promise<RawMetric | null> {
    const types: string[] = [];
    if (canReadReorder) types.push('REORDER_SUGGESTION');
    if (canReadRisk) types.push('TRAINING_RISK');
    if (types.length === 0) return null;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int FROM prediction_runs pr
       WHERE pr.type = ANY($1::text[]) AND pr.ml_service_status = 'UNAVAILABLE_FALLBACK_USED'
         AND pr.started_at >= $2::timestamptz AND pr.started_at < $3::timestamptz`,
      [types, window.from.toISOString(), window.to.toISOString()],
    ) ?? 0;
    return { key: 'LATE_DATA_COUNT', unit: 'COUNT', value: String(count), recordCount: count };
  }
}

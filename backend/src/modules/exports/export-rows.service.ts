import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { ReportFiltersDto } from '../../common/reports/report-filters.dto';
import { DateWindow } from '../../common/reports/resolve-window.util';
import { DashboardsService } from '../dashboards/dashboards.service';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { DASHBOARD_EXPORT_TYPES, ExportType, MetricTotalDto } from './dto/export.dto';

export interface ExportRowsResult {
  headers: string[];
  rows: string[][];
  rowCount: number;
  totals: MetricTotalDto[];
}

const ROW_LIMIT = 5000;

function cell(value: string | number | boolean | Date | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function rowCountMetric(count: number): MetricTotalDto {
  return { key: 'ROW_COUNT', label: 'Row count', unit: 'COUNT', value: String(count), recordCount: count };
}

function totalAmountMetric(value: string, currencyCode: string | undefined, recordCount: number): MetricTotalDto {
  return { key: 'TOTAL_AMOUNT', label: 'Total amount', unit: 'MONEY', value, currencyCode, recordCount };
}

/**
 * Produces the tabular content behind every ExportType: a header row, data rows (already
 * formatted as strings — money/decimal values pass through the DecimalString text PostgreSQL
 * computed, never a JS float), and `totals` (ROW_COUNT plus, where the export has a natural
 * monetary sum, TOTAL_AMOUNT) that reconcile to a DASHBOARD_* export's own metrics or to a
 * dashboard call made with identical filters. DASHBOARD_* types delegate to DashboardsService
 * directly so the exported totals are byte-identical to what GET /dashboards/* would return for
 * the same filters (same scope resolution, same date window, same permission-based concealment).
 */
@Injectable()
export class ExportRowsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly dashboards: DashboardsService,
  ) {}

  async build(
    exportType: ExportType,
    scopeIds: string[],
    window: DateWindow,
    filters: ReportFiltersDto,
    actor: AuthenticatedPrincipal,
    customerId: string | undefined,
  ): Promise<ExportRowsResult> {
    if (DASHBOARD_EXPORT_TYPES.has(exportType)) {
      return this.buildFromDashboard(exportType, filters, actor);
    }
    switch (exportType) {
      case ExportType.JOBS:
        return this.jobs(scopeIds, window, filters);
      case ExportType.LABOR_ENTRIES:
        return this.laborEntries(scopeIds, window, filters);
      case ExportType.PART_ISSUES:
        return this.partIssues(scopeIds, window, filters, actor);
      case ExportType.STOCK_BALANCES:
        return this.stockBalances(scopeIds, filters, actor);
      case ExportType.STOCK_MOVEMENTS:
        return this.stockMovements(scopeIds, window, filters, actor);
      case ExportType.PURCHASE_ORDERS:
        return this.purchaseOrders(scopeIds, window, filters);
      case ExportType.INVOICES:
        return this.invoices(scopeIds, window);
      case ExportType.CUSTOMER_STATEMENT:
        return this.customerStatement(scopeIds, customerId!);
      case ExportType.ATTENDANCE:
        return this.attendance(scopeIds, window, filters);
      case ExportType.ASSESSMENTS:
        return this.assessments(scopeIds, window, filters);
      case ExportType.CERTIFICATES:
        return this.certificates(scopeIds, window, filters);
      case ExportType.REORDER_SUGGESTIONS:
        return this.reorderSuggestions(scopeIds, window, filters);
      case ExportType.TRAINING_RISK:
        return this.trainingRisk(scopeIds, window, filters);
      case ExportType.AUDIT_EVENTS:
        return this.auditEvents(window);
      default:
        throw new Error(`Unsupported export type: ${String(exportType)}`);
    }
  }

  private async buildFromDashboard(
    exportType: ExportType,
    filters: ReportFiltersDto,
    actor: AuthenticatedPrincipal,
  ): Promise<ExportRowsResult> {
    const dashboard = await ({
      [ExportType.DASHBOARD_WORKSHOP]: () => this.dashboards.getWorkshopDashboard(filters, actor),
      [ExportType.DASHBOARD_INVENTORY_FINANCE]: () => this.dashboards.getInventoryFinanceDashboard(filters, actor),
      [ExportType.DASHBOARD_TRAINING]: () => this.dashboards.getTrainingDashboard(filters, actor),
      [ExportType.DASHBOARD_AI_DATA]: () => this.dashboards.getAiDataDashboard(filters, actor),
    } as Record<string, () => ReturnType<DashboardsService['getWorkshopDashboard']>>)[exportType]();

    const headers = ['key', 'label', 'unit', 'value', 'currencyCode', 'recordCount'];
    const rows: string[][] = [];
    for (const metric of dashboard.metrics) {
      rows.push([metric.key, metric.label, metric.unit, metric.value, metric.currencyCode ?? '', String(metric.recordCount)]);
      for (const item of metric.breakdown ?? []) {
        rows.push([`${metric.key}.${item.key}`, item.label, metric.unit, item.value, '', String(item.recordCount ?? '')]);
      }
    }
    return {
      headers,
      rows,
      rowCount: rows.length,
      totals: dashboard.metrics.map((m) => ({
        key: m.key, label: m.label, unit: m.unit, value: m.value, currencyCode: m.currencyCode, recordCount: m.recordCount,
      })),
    };
  }

  private async jobs(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<ExportRowsResult> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    const conditions: string[] = [];
    if (filters.bayId) { params.push(filters.bayId); conditions.push(`j.bay_id = $${params.length}`); }
    if (filters.technicianId) { params.push(filters.technicianId); conditions.push(`j.technician_id = $${params.length}`); }
    const result = await this.db.query(
      `SELECT j.job_number, j.stage, j.priority, j.service_type, j.customer_id, j.vehicle_id,
              j.technician_id, j.bay_id, j.created_at, j.delivered_at
       FROM job_cards j
       WHERE j.organization_scope_id = ANY($1::uuid[])
         AND j.created_at >= $2::timestamptz AND j.created_at < $3::timestamptz
         ${conditions.map((c) => `AND ${c}`).join(' ')}
       ORDER BY j.created_at DESC
       LIMIT ${ROW_LIMIT}`,
      params,
    );
    const headers = ['jobNumber', 'stage', 'priority', 'serviceType', 'customerId', 'vehicleId', 'technicianId', 'bayId', 'createdAt', 'deliveredAt'];
    const rows = result.rows.map((r) => [
      cell(r.job_number), cell(r.stage), cell(r.priority), cell(r.service_type), cell(r.customer_id),
      cell(r.vehicle_id), cell(r.technician_id), cell(r.bay_id), cell(r.created_at), cell(r.delivered_at),
    ]);
    return { headers, rows, rowCount: rows.length, totals: [rowCountMetric(rows.length)] };
  }

  private async laborEntries(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<ExportRowsResult> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    const conditions: string[] = [];
    if (filters.bayId) { params.push(filters.bayId); conditions.push(`j.bay_id = $${params.length}`); }
    if (filters.technicianId) { params.push(filters.technicianId); conditions.push(`le.technician_id = $${params.length}`); }
    const result = await this.db.query(
      `SELECT le.job_id, le.technician_id, le.work_date, le.duration_minutes, le.amount::text AS amount,
              le.amount_currency, le.status
       FROM labor_entries le
       JOIN job_cards j ON j.id = le.job_id
       WHERE j.organization_scope_id = ANY($1::uuid[])
         AND le.work_date >= $2::timestamptz::date AND le.work_date < $3::timestamptz::date
         ${conditions.map((c) => `AND ${c}`).join(' ')}
       ORDER BY le.work_date DESC
       LIMIT ${ROW_LIMIT}`,
      params,
    );
    const headers = ['jobId', 'technicianId', 'workDate', 'durationMinutes', 'amount', 'currency', 'status'];
    const rows = result.rows.map((r) => [
      cell(r.job_id), cell(r.technician_id), cell(r.work_date), cell(r.duration_minutes), cell(r.amount), cell(r.amount_currency), cell(r.status),
    ]);
    const totalRow = await this.db.queryOne<{ total: string; currency: string | null }>(
      `SELECT COALESCE(SUM(le.amount), 0)::text AS total, MIN(le.amount_currency) AS currency
       FROM labor_entries le
       JOIN job_cards j ON j.id = le.job_id
       WHERE j.organization_scope_id = ANY($1::uuid[])
         AND le.status = 'ACTIVE'
         AND le.work_date >= $2::timestamptz::date AND le.work_date < $3::timestamptz::date
         ${conditions.map((c) => `AND ${c}`).join(' ')}`,
      params,
    );
    return {
      headers, rows, rowCount: rows.length,
      totals: [rowCountMetric(rows.length), totalAmountMetric(totalRow?.total ?? '0', totalRow?.currency ?? undefined, rows.length)],
    };
  }

  private async partIssues(
    scopeIds: string[], window: DateWindow, filters: ReportFiltersDto, actor: AuthenticatedPrincipal,
  ): Promise<ExportRowsResult> {
    const canReadCost = actor.permissions.includes('inventory.cost.read');
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    let storeCondition = '';
    if (filters.storeId) { params.push(filters.storeId); storeCondition = `AND pi.store_id = $${params.length}`; }
    const result = await this.db.query(
      `SELECT pi.job_id, pi.part_sku, pi.store_id, pi.quantity, pi.reversed_quantity,
              pi.unit_price_amount::text AS unit_price_amount, pi.unit_price_currency,
              pi.unit_cost_amount::text AS unit_cost_amount, pi.unit_cost_currency,
              pi.line_total_amount::text AS line_total_amount, pi.line_total_currency, pi.status, pi.created_at
       FROM part_issues pi
       JOIN stores s ON s.id = pi.store_id
       WHERE s.organization_scope_id = ANY($1::uuid[])
         AND pi.created_at >= $2::timestamptz AND pi.created_at < $3::timestamptz
         ${storeCondition}
       ORDER BY pi.created_at DESC
       LIMIT ${ROW_LIMIT}`,
      params,
    );
    const headers = ['jobId', 'partSku', 'storeId', 'quantity', 'reversedQuantity', 'unitPrice', 'lineTotal', 'currency', 'status', 'createdAt'];
    if (canReadCost) headers.splice(6, 0, 'unitCost');
    const rows = result.rows.map((r) => {
      const row = [
        cell(r.job_id), cell(r.part_sku), cell(r.store_id), cell(r.quantity), cell(r.reversed_quantity),
        cell(r.unit_price_amount), cell(r.line_total_amount), cell(r.unit_price_currency), cell(r.status), cell(r.created_at),
      ];
      if (canReadCost) row.splice(6, 0, cell(r.unit_cost_amount));
      return row;
    });
    const totalRow = await this.db.queryOne<{ total: string; currency: string | null }>(
      `SELECT COALESCE(SUM(pi.line_total_amount), 0)::text AS total, MIN(pi.line_total_currency) AS currency
       FROM part_issues pi
       JOIN stores s ON s.id = pi.store_id
       WHERE s.organization_scope_id = ANY($1::uuid[])
         AND pi.created_at >= $2::timestamptz AND pi.created_at < $3::timestamptz
         ${storeCondition}`,
      params,
    );
    return {
      headers, rows, rowCount: rows.length,
      totals: [rowCountMetric(rows.length), totalAmountMetric(totalRow?.total ?? '0', totalRow?.currency ?? undefined, rows.length)],
    };
  }

  private async stockBalances(scopeIds: string[], filters: ReportFiltersDto, actor: AuthenticatedPrincipal): Promise<ExportRowsResult> {
    const canReadCost = actor.permissions.includes('inventory.cost.read');
    const params: unknown[] = [scopeIds];
    let storeCondition = '';
    if (filters.storeId) { params.push(filters.storeId); storeCondition = `AND sb.store_id = $${params.length}`; }
    const result = await this.db.query(
      `SELECT sb.store_id, sb.part_id, sb.on_hand, sb.reserved, sb.min_level, sb.max_level,
              sb.average_cost_amount::text AS average_cost_amount, sb.average_cost_currency
       FROM stock_balances sb
       JOIN stores s ON s.id = sb.store_id
       WHERE s.organization_scope_id = ANY($1::uuid[]) ${storeCondition}
       ORDER BY sb.store_id, sb.part_id
       LIMIT ${ROW_LIMIT}`,
      params,
    );
    const headers = ['storeId', 'partId', 'onHand', 'reserved', 'minLevel', 'maxLevel'];
    if (canReadCost) headers.push('averageCost', 'currency');
    const rows = result.rows.map((r) => {
      const row = [cell(r.store_id), cell(r.part_id), cell(r.on_hand), cell(r.reserved), cell(r.min_level), cell(r.max_level)];
      if (canReadCost) row.push(cell(r.average_cost_amount), cell(r.average_cost_currency));
      return row;
    });
    const totals = [rowCountMetric(rows.length)];
    if (canReadCost) {
      const totalRow = await this.db.queryOne<{ total: string; currency: string | null }>(
        `SELECT COALESCE(SUM(sb.on_hand * sb.average_cost_amount), 0)::text AS total, MIN(sb.average_cost_currency) AS currency
         FROM stock_balances sb
         JOIN stores s ON s.id = sb.store_id
         WHERE s.organization_scope_id = ANY($1::uuid[]) ${storeCondition}`,
        params,
      );
      totals.push(totalAmountMetric(totalRow?.total ?? '0', totalRow?.currency ?? undefined, rows.length));
    }
    return { headers, rows, rowCount: rows.length, totals };
  }

  private async stockMovements(
    scopeIds: string[], window: DateWindow, filters: ReportFiltersDto, actor: AuthenticatedPrincipal,
  ): Promise<ExportRowsResult> {
    const canReadCost = actor.permissions.includes('inventory.cost.read');
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    let storeCondition = '';
    if (filters.storeId) { params.push(filters.storeId); storeCondition = `AND sm.store_id = $${params.length}`; }
    const result = await this.db.query(
      `SELECT sm.store_id, sm.part_id, sm.type, sm.on_hand_delta, sm.reserved_delta,
              sm.unit_cost_amount::text AS unit_cost_amount, sm.unit_cost_currency, sm.occurred_at
       FROM stock_movements sm
       JOIN stores s ON s.id = sm.store_id
       WHERE s.organization_scope_id = ANY($1::uuid[])
         AND sm.occurred_at >= $2::timestamptz AND sm.occurred_at < $3::timestamptz
         ${storeCondition}
       ORDER BY sm.occurred_at DESC
       LIMIT ${ROW_LIMIT}`,
      params,
    );
    const headers = ['storeId', 'partId', 'type', 'onHandDelta', 'reservedDelta', 'occurredAt'];
    if (canReadCost) headers.splice(5, 0, 'unitCost', 'currency');
    const rows = result.rows.map((r) => {
      const row = [cell(r.store_id), cell(r.part_id), cell(r.type), cell(r.on_hand_delta), cell(r.reserved_delta), cell(r.occurred_at)];
      if (canReadCost) row.splice(5, 0, cell(r.unit_cost_amount), cell(r.unit_cost_currency));
      return row;
    });
    return { headers, rows, rowCount: rows.length, totals: [rowCountMetric(rows.length)] };
  }

  private async purchaseOrders(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<ExportRowsResult> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    let storeCondition = '';
    if (filters.storeId) { params.push(filters.storeId); storeCondition = `AND po.store_id = $${params.length}`; }
    const result = await this.db.query(
      `SELECT po.po_number, po.vendor_id, po.store_id, po.status, po.total_amount::text AS total_amount,
              po.total_currency, po.submitted_at, po.created_at
       FROM purchase_orders po
       JOIN stores s ON s.id = po.store_id
       WHERE s.organization_scope_id = ANY($1::uuid[])
         AND po.created_at >= $2::timestamptz AND po.created_at < $3::timestamptz
         ${storeCondition}
       ORDER BY po.created_at DESC
       LIMIT ${ROW_LIMIT}`,
      params,
    );
    const headers = ['poNumber', 'vendorId', 'storeId', 'status', 'totalAmount', 'currency', 'submittedAt', 'createdAt'];
    const rows = result.rows.map((r) => [
      cell(r.po_number), cell(r.vendor_id), cell(r.store_id), cell(r.status), cell(r.total_amount),
      cell(r.total_currency), cell(r.submitted_at), cell(r.created_at),
    ]);
    const totalRow = await this.db.queryOne<{ total: string; currency: string | null }>(
      `SELECT COALESCE(SUM(po.total_amount), 0)::text AS total, MIN(po.total_currency) AS currency
       FROM purchase_orders po
       JOIN stores s ON s.id = po.store_id
       WHERE s.organization_scope_id = ANY($1::uuid[])
         AND po.created_at >= $2::timestamptz AND po.created_at < $3::timestamptz
         ${storeCondition}`,
      params,
    );
    return {
      headers, rows, rowCount: rows.length,
      totals: [rowCountMetric(rows.length), totalAmountMetric(totalRow?.total ?? '0', totalRow?.currency ?? undefined, rows.length)],
    };
  }

  private async invoices(scopeIds: string[], window: DateWindow): Promise<ExportRowsResult> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    const result = await this.db.query(
      `SELECT i.invoice_number, i.job_id, i.customer_id, i.status, i.total_amount::text AS total_amount,
              i.currency_code, i.issued_at, i.paid_at
       FROM invoices i
       JOIN job_cards j ON j.id = i.job_id
       WHERE j.organization_scope_id = ANY($1::uuid[])
         AND i.created_at >= $2::timestamptz AND i.created_at < $3::timestamptz
       ORDER BY i.created_at DESC
       LIMIT ${ROW_LIMIT}`,
      params,
    );
    const headers = ['invoiceNumber', 'jobId', 'customerId', 'status', 'totalAmount', 'currency', 'issuedAt', 'paidAt'];
    const rows = result.rows.map((r) => [
      cell(r.invoice_number), cell(r.job_id), cell(r.customer_id), cell(r.status), cell(r.total_amount),
      cell(r.currency_code), cell(r.issued_at), cell(r.paid_at),
    ]);
    const totalRow = await this.db.queryOne<{ total: string; currency: string | null }>(
      `SELECT COALESCE(SUM(i.total_amount), 0)::text AS total, MIN(i.currency_code) AS currency
       FROM invoices i
       JOIN job_cards j ON j.id = i.job_id
       WHERE j.organization_scope_id = ANY($1::uuid[])
         AND i.status IN ('ISSUED', 'PAID')
         AND i.created_at >= $2::timestamptz AND i.created_at < $3::timestamptz`,
      params,
    );
    return {
      headers, rows, rowCount: rows.length,
      totals: [rowCountMetric(rows.length), totalAmountMetric(totalRow?.total ?? '0', totalRow?.currency ?? undefined, rows.length)],
    };
  }

  /** Scope is enforced by the caller (ExportsService) resolving the customer via customers.organization_scope_id before invoking this. */
  private async customerStatement(scopeIds: string[], customerId: string): Promise<ExportRowsResult> {
    const result = await this.db.query(
      `SELECT i.invoice_number, i.job_id, i.status, i.total_amount::text AS total_amount, i.currency_code, i.issued_at, i.paid_at
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE i.customer_id = $1 AND c.organization_scope_id = ANY($2::uuid[]) AND i.status <> 'DRAFT'
       ORDER BY i.created_at DESC
       LIMIT ${ROW_LIMIT}`,
      [customerId, scopeIds],
    );
    const headers = ['invoiceNumber', 'jobId', 'status', 'totalAmount', 'currency', 'issuedAt', 'paidAt'];
    const rows = result.rows.map((r) => [
      cell(r.invoice_number), cell(r.job_id), cell(r.status), cell(r.total_amount), cell(r.currency_code), cell(r.issued_at), cell(r.paid_at),
    ]);
    const totalRow = await this.db.queryOne<{ total: string; currency: string | null }>(
      `SELECT COALESCE(SUM(i.total_amount), 0)::text AS total, MIN(i.currency_code) AS currency
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE i.customer_id = $1 AND c.organization_scope_id = ANY($2::uuid[]) AND i.status IN ('ISSUED', 'PAID')`,
      [customerId, scopeIds],
    );
    return {
      headers, rows, rowCount: rows.length,
      totals: [rowCountMetric(rows.length), totalAmountMetric(totalRow?.total ?? '0', totalRow?.currency ?? undefined, rows.length)],
    };
  }

  private async attendance(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<ExportRowsResult> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    const conditions: string[] = [];
    if (filters.courseId) { params.push(filters.courseId); conditions.push(`c.id = $${params.length}`); }
    if (filters.termId) { params.push(filters.termId); conditions.push(`c.term_id = $${params.length}`); }
    const result = await this.db.query(
      `SELECT ar.session_id, ar.student_id, ar.status, ar.note, ar.recorded_at
       FROM attendance_records ar
       JOIN training_sessions ts ON ts.id = ar.session_id
       JOIN courses c ON c.id = ts.course_id
       WHERE c.organization_scope_id = ANY($1::uuid[])
         AND ar.recorded_at >= $2::timestamptz AND ar.recorded_at < $3::timestamptz
         ${conditions.map((c2) => `AND ${c2}`).join(' ')}
       ORDER BY ar.recorded_at DESC
       LIMIT ${ROW_LIMIT}`,
      params,
    );
    const headers = ['sessionId', 'studentId', 'status', 'note', 'recordedAt'];
    const rows = result.rows.map((r) => [cell(r.session_id), cell(r.student_id), cell(r.status), cell(r.note), cell(r.recorded_at)]);
    return { headers, rows, rowCount: rows.length, totals: [rowCountMetric(rows.length)] };
  }

  private async assessments(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<ExportRowsResult> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    const conditions: string[] = [];
    if (filters.courseId) { params.push(filters.courseId); conditions.push(`c.id = $${params.length}`); }
    if (filters.termId) { params.push(filters.termId); conditions.push(`c.term_id = $${params.length}`); }
    const result = await this.db.query(
      `SELECT a.student_id, a.course_id, a.task_id, a.result, a.sign_off_status, a.assessed_at
       FROM assessments a
       JOIN courses c ON c.id = a.course_id
       WHERE c.organization_scope_id = ANY($1::uuid[])
         AND a.assessed_at >= $2::timestamptz AND a.assessed_at < $3::timestamptz
         ${conditions.map((c2) => `AND ${c2}`).join(' ')}
       ORDER BY a.assessed_at DESC
       LIMIT ${ROW_LIMIT}`,
      params,
    );
    const headers = ['studentId', 'courseId', 'taskId', 'result', 'signOffStatus', 'assessedAt'];
    const rows = result.rows.map((r) => [
      cell(r.student_id), cell(r.course_id), cell(r.task_id), cell(r.result), cell(r.sign_off_status), cell(r.assessed_at),
    ]);
    return { headers, rows, rowCount: rows.length, totals: [rowCountMetric(rows.length)] };
  }

  private async certificates(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<ExportRowsResult> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    const conditions: string[] = [];
    if (filters.courseId) { params.push(filters.courseId); conditions.push(`c.id = $${params.length}`); }
    if (filters.termId) { params.push(filters.termId); conditions.push(`c.term_id = $${params.length}`); }
    const result = await this.db.query(
      `SELECT cert.certificate_number, cert.student_id, cert.course_id, cert.status, cert.issued_at, cert.revoked_at
       FROM certificates cert
       JOIN courses c ON c.id = cert.course_id
       WHERE c.organization_scope_id = ANY($1::uuid[])
         AND cert.issued_at >= $2::timestamptz AND cert.issued_at < $3::timestamptz
         ${conditions.map((c2) => `AND ${c2}`).join(' ')}
       ORDER BY cert.issued_at DESC
       LIMIT ${ROW_LIMIT}`,
      params,
    );
    const headers = ['certificateNumber', 'studentId', 'courseId', 'status', 'issuedAt', 'revokedAt'];
    const rows = result.rows.map((r) => [
      cell(r.certificate_number), cell(r.student_id), cell(r.course_id), cell(r.status), cell(r.issued_at), cell(r.revoked_at),
    ]);
    return { headers, rows, rowCount: rows.length, totals: [rowCountMetric(rows.length)] };
  }

  private async reorderSuggestions(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<ExportRowsResult> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    let storeCondition = '';
    if (filters.storeId) { params.push(filters.storeId); storeCondition = `AND p.store_id = $${params.length}`; }
    const result = await this.db.query(
      `SELECT p.store_id, p.part_id, p.status, p.decision, p.reorder_suggested_quantity, p.generated_at
       FROM predictions p
       JOIN stores s ON s.id = p.store_id
       WHERE p.type = 'REORDER_SUGGESTION'
         AND s.organization_scope_id = ANY($1::uuid[])
         AND p.generated_at >= $2::timestamptz AND p.generated_at < $3::timestamptz
         ${storeCondition}
       ORDER BY p.generated_at DESC
       LIMIT ${ROW_LIMIT}`,
      params,
    );
    const headers = ['storeId', 'partId', 'status', 'decision', 'suggestedQuantity', 'generatedAt'];
    const rows = result.rows.map((r) => [
      cell(r.store_id), cell(r.part_id), cell(r.status), cell(r.decision), cell(r.reorder_suggested_quantity), cell(r.generated_at),
    ]);
    return { headers, rows, rowCount: rows.length, totals: [rowCountMetric(rows.length)] };
  }

  private async trainingRisk(scopeIds: string[], window: DateWindow, filters: ReportFiltersDto): Promise<ExportRowsResult> {
    const params: unknown[] = [scopeIds, window.from.toISOString(), window.to.toISOString()];
    const conditions: string[] = [];
    if (filters.courseId) { params.push(filters.courseId); conditions.push(`c.id = $${params.length}`); }
    if (filters.termId) { params.push(filters.termId); conditions.push(`c.term_id = $${params.length}`); }
    const result = await this.db.query(
      `SELECT p.student_id, p.course_id, p.status, p.decision, p.risk_level, p.generated_at
       FROM predictions p
       JOIN courses c ON c.id = p.course_id
       WHERE p.type = 'TRAINING_RISK'
         AND c.organization_scope_id = ANY($1::uuid[])
         AND p.generated_at >= $2::timestamptz AND p.generated_at < $3::timestamptz
         ${conditions.map((c2) => `AND ${c2}`).join(' ')}
       ORDER BY p.generated_at DESC
       LIMIT ${ROW_LIMIT}`,
      params,
    );
    const headers = ['studentId', 'courseId', 'status', 'decision', 'riskLevel', 'generatedAt'];
    const rows = result.rows.map((r) => [
      cell(r.student_id), cell(r.course_id), cell(r.status), cell(r.decision), cell(r.risk_level), cell(r.generated_at),
    ]);
    return { headers, rows, rowCount: rows.length, totals: [rowCountMetric(rows.length)] };
  }

  /** audit_events has no organization_scope_id column (it is a global security log); access is gated entirely by the audit.read permission required to create this export type. */
  private async auditEvents(window: DateWindow): Promise<ExportRowsResult> {
    const result = await this.db.query(
      `SELECT occurred_at, actor_user_id, action, entity_type, entity_id, outcome, summary
       FROM audit_events
       WHERE occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz
       ORDER BY occurred_at DESC
       LIMIT ${ROW_LIMIT}`,
      [window.from.toISOString(), window.to.toISOString()],
    );
    const headers = ['occurredAt', 'actorUserId', 'action', 'entityType', 'entityId', 'outcome', 'summary'];
    const rows = result.rows.map((r) => [
      cell(r.occurred_at), cell(r.actor_user_id), cell(r.action), cell(r.entity_type), cell(r.entity_id), cell(r.outcome), cell(r.summary),
    ]);
    return { headers, rows, rowCount: rows.length, totals: [rowCountMetric(rows.length)] };
  }
}

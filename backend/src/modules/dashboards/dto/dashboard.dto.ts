export enum DashboardName {
  WORKSHOP = 'WORKSHOP',
  INVENTORY_FINANCE = 'INVENTORY_FINANCE',
  TRAINING = 'TRAINING',
  AI_DATA = 'AI_DATA',
}

export type MetricUnit = 'COUNT' | 'PERCENT' | 'HOURS' | 'DAYS' | 'MONEY' | 'RATIO';

export interface MetricBreakdownDto {
  key: string;
  label: string;
  value: string;
  recordCount?: number;
}

/** Matches the OpenAPI Metric schema. `value` is always a DecimalString produced by SQL — never a JS float. */
export interface MetricDto {
  key: string;
  label: string;
  unit: MetricUnit;
  value: string;
  currencyCode?: string;
  recordCount: number;
  breakdown?: MetricBreakdownDto[];
}

export interface DashboardResponseDto {
  dashboard: DashboardName;
  generatedAt: string;
  dataAsOf: string;
  filterFingerprint: string;
  appliedFilters: Record<string, string | undefined>;
  metrics: MetricDto[];
}

/** Internal shape produced by DashboardsRepository methods, before labels/permission-gating are applied by the service. */
export interface RawMetric {
  key: string;
  unit: MetricUnit;
  value: string;
  currencyCode?: string;
  recordCount: number;
  breakdown?: MetricBreakdownDto[];
  /** When set, this metric is included in the response only if the actor holds this permission. */
  requiresPermission?: string;
}

export const METRIC_LABELS: Record<string, string> = {
  JOBS_BY_STAGE: 'Jobs by stage',
  TURNAROUND_HOURS: 'Average turnaround (hours)',
  REWORK_RATE: 'Rework rate',
  LABOR_HOURS: 'Labor hours',
  BAY_UTILIZATION: 'Bay utilization',
  TECHNICIAN_UTILIZATION: 'Technician utilization',
  STOCK_ACCURACY: 'Stock accuracy',
  STOCKOUTS: 'Stockouts',
  INVENTORY_TURNOVER: 'Inventory turnover',
  PURCHASE_LEAD_TIME_DAYS: 'Purchase lead time (days)',
  INVOICE_VARIANCE: 'Invoice variance vs. approved estimates',
  AGING_REFERENCES: 'Unpaid invoices (aging)',
  ATTENDANCE_RATE: 'Attendance rate',
  ASSESSMENT_COMPLETION_RATE: 'Assessment completion rate',
  PASS_RATE: 'Pass rate',
  NEEDS_IMPROVEMENT_RATE: 'Needs-improvement rate',
  COMPETENCY_COVERAGE: 'Competency coverage',
  CERTIFICATES_ISSUED: 'Certificates issued',
  REORDER_ACCEPTANCE_RATE: 'Reorder acceptance rate',
  REORDER_OVERRIDE_RATE: 'Reorder override rate',
  FORECAST_EVALUATION: 'Reorder forecast evaluation',
  TRAINING_RISK_EVALUATION: 'Training risk evaluation',
  MISSING_DATA_COUNT: 'Missing data count',
  LATE_DATA_COUNT: 'Late data count (ML fallback used)',
};

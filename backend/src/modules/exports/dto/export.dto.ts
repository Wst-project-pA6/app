import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { PaginationQuery } from '../../../common/pagination/pagination.query';
import { ReportFiltersDto } from '../../../common/reports/report-filters.dto';

export enum ExportType {
  JOBS = 'JOBS',
  LABOR_ENTRIES = 'LABOR_ENTRIES',
  PART_ISSUES = 'PART_ISSUES',
  STOCK_BALANCES = 'STOCK_BALANCES',
  STOCK_MOVEMENTS = 'STOCK_MOVEMENTS',
  PURCHASE_ORDERS = 'PURCHASE_ORDERS',
  INVOICES = 'INVOICES',
  CUSTOMER_STATEMENT = 'CUSTOMER_STATEMENT',
  ATTENDANCE = 'ATTENDANCE',
  ASSESSMENTS = 'ASSESSMENTS',
  CERTIFICATES = 'CERTIFICATES',
  REORDER_SUGGESTIONS = 'REORDER_SUGGESTIONS',
  TRAINING_RISK = 'TRAINING_RISK',
  DASHBOARD_WORKSHOP = 'DASHBOARD_WORKSHOP',
  DASHBOARD_INVENTORY_FINANCE = 'DASHBOARD_INVENTORY_FINANCE',
  DASHBOARD_TRAINING = 'DASHBOARD_TRAINING',
  DASHBOARD_AI_DATA = 'DASHBOARD_AI_DATA',
  AUDIT_EVENTS = 'AUDIT_EVENTS',
}

export enum ExportFormat {
  CSV = 'CSV',
  PDF = 'PDF',
}

export enum ExportStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

/** Matches `x-required-permission-by-type` on the ExportType schema in the frozen contract exactly. */
export const EXPORT_TYPE_PERMISSION: Record<ExportType, string> = {
  [ExportType.JOBS]: 'jobs.read',
  [ExportType.LABOR_ENTRIES]: 'labor.read',
  [ExportType.PART_ISSUES]: 'inventory.read',
  [ExportType.STOCK_BALANCES]: 'inventory.read',
  [ExportType.STOCK_MOVEMENTS]: 'inventory.read',
  [ExportType.PURCHASE_ORDERS]: 'purchasing.read',
  [ExportType.INVOICES]: 'invoices.read',
  [ExportType.CUSTOMER_STATEMENT]: 'invoices.read',
  [ExportType.ATTENDANCE]: 'training.read',
  [ExportType.ASSESSMENTS]: 'training.read',
  [ExportType.CERTIFICATES]: 'training.read',
  [ExportType.REORDER_SUGGESTIONS]: 'predictions.reorder.read',
  [ExportType.TRAINING_RISK]: 'predictions.risk.read',
  [ExportType.DASHBOARD_WORKSHOP]: 'dashboards.workshop',
  [ExportType.DASHBOARD_INVENTORY_FINANCE]: 'dashboards.inventory-finance',
  [ExportType.DASHBOARD_TRAINING]: 'dashboards.training',
  [ExportType.DASHBOARD_AI_DATA]: 'dashboards.ai-data',
  [ExportType.AUDIT_EVENTS]: 'audit.read',
};

/**
 * "True when the export contains customer, student, financial or attachment-related data"
 * (contract description of ExportJob.sensitive). Dashboard exports carry only aggregated
 * metrics (no row-level PII/financial detail) so they are not flagged sensitive; every row-level
 * export of customer, student or money-bearing data is.
 */
export const SENSITIVE_EXPORT_TYPES = new Set<ExportType>([
  ExportType.PART_ISSUES,
  ExportType.STOCK_BALANCES,
  ExportType.STOCK_MOVEMENTS,
  ExportType.PURCHASE_ORDERS,
  ExportType.INVOICES,
  ExportType.CUSTOMER_STATEMENT,
  ExportType.ATTENDANCE,
  ExportType.ASSESSMENTS,
  ExportType.CERTIFICATES,
  ExportType.TRAINING_RISK,
  ExportType.AUDIT_EVENTS,
]);

export const DASHBOARD_EXPORT_TYPES = new Set<ExportType>([
  ExportType.DASHBOARD_WORKSHOP,
  ExportType.DASHBOARD_INVENTORY_FINANCE,
  ExportType.DASHBOARD_TRAINING,
  ExportType.DASHBOARD_AI_DATA,
]);

export class ExportJobCreateRequestDto {
  @IsEnum(ExportType)
  exportType!: ExportType;

  @IsEnum(ExportFormat)
  format!: ExportFormat;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReportFiltersDto)
  filters?: ReportFiltersDto;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsEnum(['en', 'ar'])
  locale?: 'en' | 'ar';
}

export class ExportJobListQuery extends PaginationQuery {
  @IsOptional()
  @IsEnum(ExportStatus)
  status?: ExportStatus;

  @IsOptional()
  @IsEnum(ExportType)
  exportType?: ExportType;
}

export interface MetricTotalDto {
  key: string;
  label: string;
  unit: string;
  value: string;
  currencyCode?: string;
  recordCount: number;
}

export interface ExportJobDto {
  id: string;
  exportType: ExportType;
  format: ExportFormat;
  status: ExportStatus;
  filters: Record<string, string | undefined>;
  filterFingerprint: string;
  sensitive: boolean;
  customerId?: string;
  rowCount?: number;
  totals?: MetricTotalDto[];
  completedAt?: string;
  expiresAt?: string;
  failureMessage?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface ExportJobPageDto {
  items: ExportJobDto[];
  page: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export interface DownloadAuthorizationDto {
  url: string;
  expiresAt: string;
}

import { Inject, Injectable } from '@nestjs/common';
import { ScopeService } from '../../common/auth/scope.service';
import { computeFilterFingerprint } from '../../common/reports/filter-fingerprint.util';
import { ReportFiltersDto } from '../../common/reports/report-filters.dto';
import { resolveScopeIds } from '../../common/reports/resolve-scope-ids.util';
import { DateWindow, resolveReportWindow } from '../../common/reports/resolve-window.util';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { DashboardsRepository } from './dashboards.repository';
import { DashboardName, DashboardResponseDto, METRIC_LABELS, MetricDto, RawMetric } from './dto/dashboard.dto';

export const DASHBOARDS_CLOCK = Symbol('DASHBOARDS_CLOCK');

/**
 * Reads dashboards.workshop/inventory-finance/training/ai-data. Every metric is a live
 * aggregation (see DashboardsRepository) — nothing here is cached or precomputed. The same
 * filters+scope resolution (resolveScopeIds, resolveWindow, computeFilterFingerprint) is used
 * verbatim by ExportsService for DASHBOARD_* export types, so a dashboard call and an export
 * created with identical filters always reconcile (equal filterFingerprint, equal totals).
 */
@Injectable()
export class DashboardsService {
  constructor(
    private readonly repository: DashboardsRepository,
    private readonly scopeService: ScopeService,
    @Inject(DASHBOARDS_CLOCK) private readonly clock: () => number,
  ) {}

  async getWorkshopDashboard(filters: ReportFiltersDto, actor: AuthenticatedPrincipal): Promise<DashboardResponseDto> {
    const { scopeIds, window } = this.resolve(filters, actor);
    const metrics = await this.repository.getWorkshopMetrics(scopeIds, window, filters);
    return this.buildResponse(DashboardName.WORKSHOP, filters, scopeIds, metrics, actor);
  }

  async getInventoryFinanceDashboard(filters: ReportFiltersDto, actor: AuthenticatedPrincipal): Promise<DashboardResponseDto> {
    const { scopeIds, window } = this.resolve(filters, actor);
    const metrics = await this.repository.getInventoryFinanceMetrics(scopeIds, window, filters);
    return this.buildResponse(DashboardName.INVENTORY_FINANCE, filters, scopeIds, metrics, actor);
  }

  async getTrainingDashboard(filters: ReportFiltersDto, actor: AuthenticatedPrincipal): Promise<DashboardResponseDto> {
    const { scopeIds, window } = this.resolve(filters, actor);
    const metrics = await this.repository.getTrainingMetrics(scopeIds, window, filters);
    return this.buildResponse(DashboardName.TRAINING, filters, scopeIds, metrics, actor);
  }

  async getAiDataDashboard(filters: ReportFiltersDto, actor: AuthenticatedPrincipal): Promise<DashboardResponseDto> {
    const { scopeIds, window } = this.resolve(filters, actor);
    const canReadReorder = actor.permissions.includes('predictions.reorder.read');
    const canReadRisk = actor.permissions.includes('predictions.risk.read');
    const metrics = await this.repository.getAiDataMetrics(scopeIds, window, filters, canReadReorder, canReadRisk);
    return this.buildResponse(DashboardName.AI_DATA, filters, scopeIds, metrics, actor);
  }

  private resolve(filters: ReportFiltersDto, actor: AuthenticatedPrincipal): { scopeIds: string[]; window: DateWindow } {
    const scopeIds = resolveScopeIds(filters.organizationScopeId, this.scopeService.allowedScopeIds(actor));
    return { scopeIds, window: resolveReportWindow(filters, this.clock()) };
  }

  private buildResponse(
    dashboard: DashboardName,
    filters: ReportFiltersDto,
    scopeIds: string[],
    rawMetrics: RawMetric[],
    actor: AuthenticatedPrincipal,
  ): DashboardResponseDto {
    const metrics: MetricDto[] = rawMetrics
      .filter((metric) => !metric.requiresPermission || actor.permissions.includes(metric.requiresPermission))
      .map((metric) => ({
        key: metric.key,
        label: METRIC_LABELS[metric.key] ?? metric.key,
        unit: metric.unit,
        value: metric.value,
        ...(metric.currencyCode ? { currencyCode: metric.currencyCode } : {}),
        recordCount: metric.recordCount,
        ...(metric.breakdown ? { breakdown: metric.breakdown } : {}),
      }));

    const nowIso = new Date(this.clock()).toISOString();
    return {
      dashboard,
      generatedAt: nowIso,
      dataAsOf: nowIso,
      filterFingerprint: computeFilterFingerprint(filters, scopeIds),
      appliedFilters: {
        from: filters.from,
        to: filters.to,
        organizationScopeId: filters.organizationScopeId,
        storeId: filters.storeId,
        bayId: filters.bayId,
        technicianId: filters.technicianId,
        courseId: filters.courseId,
        termId: filters.termId,
      },
      metrics,
    };
  }
}

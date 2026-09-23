import { Controller, Get, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { ReportFiltersDto } from '../../common/reports/report-filters.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { DashboardsService } from './dashboards.service';

@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly service: DashboardsService) {}

  @Get('workshop')
  @Permissions('dashboards.workshop')
  getWorkshop(@Query() filters: ReportFiltersDto, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.getWorkshopDashboard(filters, actor);
  }

  @Get('inventory-finance')
  @Permissions('dashboards.inventory-finance')
  getInventoryFinance(@Query() filters: ReportFiltersDto, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.getInventoryFinanceDashboard(filters, actor);
  }

  @Get('training')
  @Permissions('dashboards.training')
  getTraining(@Query() filters: ReportFiltersDto, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.getTrainingDashboard(filters, actor);
  }

  @Get('ai-data')
  @Permissions('dashboards.ai-data')
  getAiData(@Query() filters: ReportFiltersDto, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.getAiDataDashboard(filters, actor);
  }
}

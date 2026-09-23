import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { DashboardsController } from './dashboards.controller';
import { DASHBOARDS_CLOCK, DashboardsService } from './dashboards.service';
import { DashboardsRepository } from './dashboards.repository';

@Module({
  imports: [AccessModule],
  controllers: [DashboardsController],
  providers: [
    DashboardsRepository,
    DashboardsService,
    { provide: DASHBOARDS_CLOCK, useValue: Date.now },
  ],
  exports: [DashboardsService, DashboardsRepository],
})
export class DashboardsModule {}

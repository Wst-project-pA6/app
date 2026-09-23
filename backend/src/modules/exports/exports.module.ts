import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuditModule } from '../../common/audit/audit.module';
import { EXPORT_STORAGE, LocalExportStorage } from '../../common/storage/local-export-storage';
import { DashboardsModule } from '../dashboards/dashboards.module';
import { EXPORT_RATE_LIMITER_CLOCK, ExportRateLimiter } from './export-rate-limiter';
import { ExportRowsService } from './export-rows.service';
import { ExportsController } from './exports.controller';
import { ExportsRepository } from './exports.repository';
import { EXPORTS_CLOCK, EXPORTS_SCHEDULER, ExportsService } from './exports.service';

@Module({
  imports: [AccessModule, AuditModule, DashboardsModule],
  controllers: [ExportsController],
  providers: [
    ExportsRepository,
    ExportRowsService,
    ExportsService,
    ExportRateLimiter,
    { provide: EXPORT_RATE_LIMITER_CLOCK, useValue: Date.now },
    { provide: EXPORTS_CLOCK, useValue: Date.now },
    { provide: EXPORTS_SCHEDULER, useValue: (work: () => void | Promise<void>) => setImmediate(work) },
    { provide: EXPORT_STORAGE, useClass: LocalExportStorage },
  ],
})
export class ExportsModule {}

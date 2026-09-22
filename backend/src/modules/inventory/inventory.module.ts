import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { AccessModule } from '../access/access.module';
import { JobsModule } from '../jobs/jobs.module';
import { PartIssuesController } from './part-issues.controller';
import { PartIssuesRepository } from './part-issues.repository';
import { PartIssuesService } from './part-issues.service';
import { PartReservationsController } from './part-reservations.controller';
import { PartReservationsRepository } from './part-reservations.repository';
import { PartReservationsService } from './part-reservations.service';
import { PartsController } from './parts.controller';
import { PartsRepository } from './parts.repository';
import { PartsService } from './parts.service';
import { StockBalancesController } from './stock-balances.controller';
import { StockBalancesRepository } from './stock-balances.repository';
import { StockBalancesService } from './stock-balances.service';
import { StockAdjustmentsController } from './stock-adjustments.controller';
import { StockAdjustmentsRepository } from './stock-adjustments.repository';
import { StockAdjustmentsService } from './stock-adjustments.service';
import { StoresController } from './stores.controller';
import { StoresRepository } from './stores.repository';
import { StoresService } from './stores.service';

@Module({
  imports: [AccessModule, AuditModule, JobsModule],
  controllers: [
    StoresController,
    PartsController,
    StockBalancesController,
    PartReservationsController,
    PartIssuesController,
    StockAdjustmentsController,
  ],
  providers: [
    StoresRepository,
    StoresService,
    PartsRepository,
    PartsService,
    StockBalancesRepository,
    StockBalancesService,
    PartReservationsRepository,
    PartReservationsService,
    PartIssuesRepository,
    PartIssuesService,
    StockAdjustmentsRepository,
    StockAdjustmentsService,
  ],
  exports: [
    StoresRepository,
    StoresService,
    PartsRepository,
    PartsService,
    StockBalancesRepository,
    StockBalancesService,
    PartReservationsRepository,
    PartReservationsService,
    PartIssuesRepository,
    PartIssuesService,
    StockAdjustmentsRepository,
    StockAdjustmentsService,
  ],
})
export class InventoryModule {}

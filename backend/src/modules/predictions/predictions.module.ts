import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module';
import { AuditModule } from '../../common/audit/audit.module';
import { InventoryModule } from '../inventory/inventory.module';
import { TrainingModule } from '../training/training.module';
import { AI_PREDICTION_CLIENT } from './ai/ai-prediction-client';
import { HttpAiPredictionClient } from './ai/http-ai-prediction-client';
import { PREDICTION_RUN_RATE_LIMITER_CLOCK, PredictionRunRateLimiter } from './prediction-run-rate-limiter';
import { PredictionRunsController } from './prediction-runs.controller';
import { PredictionRunsRepository } from './prediction-runs.repository';
import { PREDICTION_RUNS_CLOCK, PredictionRunsService } from './prediction-runs.service';
import { PredictionSettingsController } from './prediction-settings.controller';
import { PredictionSettingsRepository } from './prediction-settings.repository';
import { PredictionSettingsService } from './prediction-settings.service';
import { PredictionsController } from './predictions.controller';
import { PredictionsRepository } from './predictions.repository';
import { PredictionsService } from './predictions.service';
import { ReorderBaselineRepository } from './reorder-baseline.repository';
import { TrainingRiskBaselineRepository } from './training-risk-baseline.repository';

@Module({
  imports: [AccessModule, AuditModule, InventoryModule, TrainingModule],
  controllers: [PredictionSettingsController, PredictionsController, PredictionRunsController],
  providers: [
    PredictionSettingsRepository,
    PredictionSettingsService,
    PredictionsRepository,
    PredictionsService,
    ReorderBaselineRepository,
    TrainingRiskBaselineRepository,
    PredictionRunsRepository,
    PredictionRunsService,
    PredictionRunRateLimiter,
    { provide: PREDICTION_RUN_RATE_LIMITER_CLOCK, useValue: Date.now },
    { provide: PREDICTION_RUNS_CLOCK, useValue: Date.now },
    { provide: AI_PREDICTION_CLIENT, useClass: HttpAiPredictionClient },
  ],
})
export class PredictionsModule {}

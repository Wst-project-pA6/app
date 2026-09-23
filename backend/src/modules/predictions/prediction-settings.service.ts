import { HttpStatus, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuditService } from '../../common/audit/audit.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { PredictionSettingsResponse, PredictionSettingsUpdateDto } from './dto/prediction-settings.dto';
import { PredictionSettingsRepository, PredictionSettingsRow } from './prediction-settings.repository';

const settingsNotFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Prediction settings are not configured');

/** GET/PUT /config/prediction-settings — same singleton-config + optimistic-concurrency pattern as PurchaseApprovalPolicyService. */
@Injectable()
export class PredictionSettingsService {
  constructor(
    private readonly repository: PredictionSettingsRepository,
    private readonly transaction: TransactionService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<PredictionSettingsResponse> {
    const row = await this.repository.get();
    if (!row) throw settingsNotFound();
    return this.map(row);
  }

  async replace(dto: PredictionSettingsUpdateDto, actor: AuthenticatedPrincipal): Promise<PredictionSettingsResponse> {
    return this.transaction.runInTransaction(async (client: PoolClient) => {
      const current = await this.repository.lock(client);
      if (!current) throw settingsNotFound();
      if (current.version !== dto.version) {
        throw new AppError(HttpStatus.CONFLICT, ErrorCode.VERSION_CONFLICT, 'Prediction settings version conflict');
      }

      const updated = await this.repository.update(client, {
        reorderLookbackWeeks: dto.reorderLookbackWeeks,
        mlServiceEnabled: dto.mlServiceEnabled,
        actorId: actor.id,
      });

      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'CONFIG.PREDICTION_SETTINGS.UPDATE',
        entityType: 'PREDICTION_SETTINGS',
        outcome: 'SUCCESS',
        summary: `Updated prediction settings to version ${updated.version} (mlServiceEnabled=${updated.ml_service_enabled})`,
      });

      return this.map(updated);
    });
  }

  private map(row: PredictionSettingsRow): PredictionSettingsResponse {
    return {
      version: row.version,
      reorderLookbackWeeks: row.reorder_lookback_weeks,
      mlServiceEnabled: row.ml_service_enabled,
      baselineVersion: row.baseline_version,
    };
  }
}

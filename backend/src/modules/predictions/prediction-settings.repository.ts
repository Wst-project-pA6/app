import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';

export interface PredictionSettingsRow {
  id: boolean;
  version: number;
  reorder_lookback_weeks: number;
  ml_service_enabled: boolean;
  baseline_version: string;
  updated_at: Date;
  updated_by: string | null;
}

const SETTINGS_SELECT = `
  id, version, reorder_lookback_weeks, ml_service_enabled, baseline_version, updated_at, updated_by`;

@Injectable()
export class PredictionSettingsRepository {
  constructor(private readonly db: DatabaseService) {}

  async get(client?: PoolClient): Promise<PredictionSettingsRow | null> {
    const sql = `SELECT ${SETTINGS_SELECT} FROM prediction_settings WHERE id = TRUE`;
    const result = client ? await client.query<PredictionSettingsRow>(sql) : await this.db.query<PredictionSettingsRow>(sql);
    return result.rows[0] ?? null;
  }

  async lock(client: PoolClient): Promise<PredictionSettingsRow | null> {
    const result = await client.query<PredictionSettingsRow>(
      `SELECT ${SETTINGS_SELECT} FROM prediction_settings WHERE id = TRUE FOR UPDATE`,
    );
    return result.rows[0] ?? null;
  }

  async update(
    client: PoolClient,
    data: { reorderLookbackWeeks: number; mlServiceEnabled: boolean; actorId: string },
  ): Promise<PredictionSettingsRow> {
    const result = await client.query<PredictionSettingsRow>(
      `UPDATE prediction_settings
       SET version = version + 1, reorder_lookback_weeks = $1, ml_service_enabled = $2, updated_by = $3
       WHERE id = TRUE
       RETURNING ${SETTINGS_SELECT}`,
      [data.reorderLookbackWeeks, data.mlServiceEnabled, data.actorId],
    );
    return result.rows[0];
  }
}

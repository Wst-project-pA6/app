import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';

export interface PredictionRunRow {
  id: string;
  type: 'REORDER_SUGGESTION' | 'TRAINING_RISK';
  source_kind: 'RULE_BASELINE' | 'ML_MODEL';
  source_name: string;
  source_version: string;
  started_at: Date;
  finished_at: Date;
  generated_count: number;
  ml_service_status: 'NOT_ENABLED' | 'AVAILABLE' | 'UNAVAILABLE_FALLBACK_USED';
  triggered_by: string;
}

/** Writes only ever target prediction_runs — bookkeeping about a run, never operational data. */
@Injectable()
export class PredictionRunsRepository {
  constructor(private readonly db: DatabaseService) {}

  async insert(
    client: PoolClient,
    data: {
      type: string;
      sourceKind: string;
      sourceName: string;
      sourceVersion: string;
      startedAt: Date;
      finishedAt: Date;
      generatedCount: number;
      mlServiceStatus: string;
      triggeredBy: string;
    },
  ): Promise<PredictionRunRow> {
    const result = await client.query<PredictionRunRow>(
      `INSERT INTO prediction_runs
         (type, source_kind, source_name, source_version, started_at, finished_at, generated_count, ml_service_status, triggered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, type, source_kind, source_name, source_version, started_at, finished_at, generated_count, ml_service_status, triggered_by`,
      [
        data.type, data.sourceKind, data.sourceName, data.sourceVersion,
        data.startedAt.toISOString(), data.finishedAt.toISOString(), data.generatedCount, data.mlServiceStatus, data.triggeredBy,
      ],
    );
    return result.rows[0];
  }
}

import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError, ErrorDetail } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  PredictionDecision,
  PredictionDecisionRequestDto,
  PredictionDto,
  PredictionListQuery,
  PredictionPageDto,
  PredictionStatus,
  PredictionType,
  RiskLevel,
} from './dto/prediction.dto';
import { PredictionRow, PredictionsRepository } from './predictions.repository';

const notFound = (): AppError => new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');
const badRequest = (message: string): AppError => new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);
const validationFailed = (field: string, code: string, message: string): AppError => {
  const detail: ErrorDetail = { field, code, message };
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED, 'Validation failed', [detail]);
};
const invalidStateTransition = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.INVALID_STATE_TRANSITION, 'Prediction is not ACTIVE');

function page<T>(query: { page: number; pageSize: number }, rows: T[], totalItems: number) {
  return {
    items: rows,
    page: { page: query.page, pageSize: query.pageSize, totalItems, totalPages: Math.ceil(totalItems / query.pageSize) },
  };
}

export function mapPrediction(row: PredictionRow): PredictionDto {
  const dto: PredictionDto = {
    id: row.id,
    type: row.type as PredictionType,
    status: row.status as PredictionStatus,
    advisoryOnly: true,
    generatedAt: row.generated_at.toISOString(),
    source: { kind: row.source_kind, name: row.source_name, version: row.source_version },
    explanation: { summary: row.explanation_summary, factors: row.explanation_factors },
    evaluation: {
      outcome: row.evaluation_outcome,
      ...(row.evaluated_at ? { evaluatedAt: row.evaluated_at.toISOString() } : {}),
      ...(row.evaluation_note ? { note: row.evaluation_note } : {}),
    },
  };
  if (row.type === 'REORDER_SUGGESTION') {
    dto.reorder = {
      input: row.reorder_input as never,
      result: {
        suggestedQuantity: row.reorder_suggested_quantity!,
        ...(row.reorder_estimated_weeks_of_cover ? { estimatedWeeksOfCover: row.reorder_estimated_weeks_of_cover } : {}),
      },
    };
  } else {
    dto.trainingRisk = {
      input: row.risk_input as never,
      result: { riskLevel: row.risk_level as RiskLevel, flags: row.risk_flags ?? [] },
    };
  }
  if (row.decision) {
    dto.decision = {
      decision: row.decision as PredictionDecision,
      decidedBy: row.decided_by!,
      decidedAt: row.decided_at!.toISOString(),
      ...(row.override_reason ? { overrideReason: row.override_reason } : {}),
      ...(row.override_quantity !== null ? { overrideQuantity: row.override_quantity } : {}),
      ...(row.decision_note ? { note: row.decision_note } : {}),
    };
  }
  return dto;
}

/**
 * Reads and decides on predictions. Mirrors dashboards.service.ts's scoped-read shape: permission
 * determines which prediction TYPE is even visible (predictions.reorder.read / .risk.read), row
 * scope narrows further by the caller's organization scopes (via the owning store or course), and
 * — matching StudentsService.list's existing mentorOnly convention — a MENTOR sees only their own
 * students' risk predictions. This service only ever reads `predictions` and writes decision
 * bookkeeping back onto the SAME row; it never touches any other module's tables.
 */
@Injectable()
export class PredictionsService {
  constructor(
    private readonly repository: PredictionsRepository,
    private readonly scopeService: ScopeService,
    private readonly transaction: TransactionService,
    private readonly audit: AuditService,
  ) {}

  async list(query: PredictionListQuery, actor: AuthenticatedPrincipal): Promise<PredictionPageDto> {
    const scopeIds = this.scopeService.allowedScopeIds(actor);
    const canReadReorder = actor.permissions.includes('predictions.reorder.read');
    const canReadRisk = actor.permissions.includes('predictions.risk.read');
    const mentorUserId = canReadRisk && actor.roles.includes('MENTOR') ? actor.id : undefined;

    let result;
    try {
      result = await this.repository.list(query, scopeIds, canReadReorder, canReadRisk, mentorUserId);
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_SORT') throw badRequest('Unknown sort field');
      throw error;
    }
    return page(query, result.rows.map(mapPrediction), result.totalItems);
  }

  async get(predictionId: string, actor: AuthenticatedPrincipal): Promise<PredictionDto> {
    const scopeIds = this.scopeService.allowedScopeIds(actor);
    const canReadReorder = actor.permissions.includes('predictions.reorder.read');
    const canReadRisk = actor.permissions.includes('predictions.risk.read');
    const mentorUserId = canReadRisk && actor.roles.includes('MENTOR') ? actor.id : undefined;

    const row = await this.repository.findScoped(predictionId, scopeIds, canReadReorder, canReadRisk, mentorUserId);
    if (!row) throw notFound();
    return mapPrediction(row);
  }

  async decide(predictionId: string, dto: PredictionDecisionRequestDto, actor: AuthenticatedPrincipal): Promise<PredictionDto> {
    if (dto.decision === 'OVERRIDDEN' && !dto.overrideReason) {
      throw validationFailed('/overrideReason', 'REQUIRED', 'overrideReason is required when decision is OVERRIDDEN');
    }

    const canDecideReorder = actor.permissions.includes('predictions.reorder.decide');
    const canDecideRisk = actor.permissions.includes('predictions.risk.decide');
    const scopeIds = this.scopeService.allowedScopeIds(actor);

    return this.transaction.runInTransaction(async (client) => {
      const row = await this.repository.findScoped(predictionId, scopeIds, canDecideReorder, canDecideRisk, undefined, client, true);
      if (!row) throw notFound();
      if (row.status !== 'ACTIVE') throw invalidStateTransition();

      const updated = await this.repository.recordDecision(client, predictionId, {
        status: dto.decision,
        decidedBy: actor.id,
        overrideReason: dto.overrideReason,
        overrideQuantity: dto.overrideQuantity,
        note: dto.note,
      });

      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'PREDICTION.DECIDE',
        entityType: 'PREDICTION',
        entityId: predictionId,
        outcome: 'SUCCESS',
        summary: `Recorded ${dto.decision} decision on a ${row.type} prediction`,
      });

      return mapPrediction(updated);
    });
  }
}

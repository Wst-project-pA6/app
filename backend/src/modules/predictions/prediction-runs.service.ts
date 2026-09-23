import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CoursesRepository } from '../training/courses.repository';
import { StoresRepository } from '../inventory/stores.repository';
import { AI_PREDICTION_CLIENT } from './ai/ai-prediction-client';
import type { AiPredictionClient, AiPredictionResponse, AiReorderResult, AiRiskResult } from './ai/ai-prediction-client';
import { PredictionRunDto, PredictionRunRequestDto, PredictionType } from './dto/prediction.dto';
import { ReorderBaselineRepository, ReorderCandidateRow } from './reorder-baseline.repository';
import { TrainingRiskBaselineRepository, RiskCandidateRow } from './training-risk-baseline.repository';
import { PredictionsRepository } from './predictions.repository';
import { PredictionRunRow, PredictionRunsRepository } from './prediction-runs.repository';
import { PredictionSettingsRepository, PredictionSettingsRow } from './prediction-settings.repository';
import { computeReorderSuggestion } from './reorder-rule.util';
import { computeTrainingRisk } from './training-risk-rule.util';

export const PREDICTION_RUNS_CLOCK = Symbol('PREDICTION_RUNS_CLOCK');

const notFound = (): AppError => new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');
const forbidden = (): AppError => new AppError(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, 'Forbidden');

function mapRun(row: PredictionRunRow): PredictionRunDto {
  return {
    id: row.id,
    type: row.type as PredictionType,
    source: { kind: row.source_kind, name: row.source_name, version: row.source_version },
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at.toISOString(),
    generatedCount: row.generated_count,
    mlService: row.ml_service_status,
  };
}

/**
 * Executes the deterministic rule baseline synchronously (WST-FR-14) and, only when
 * `mlServiceEnabled` is set in prediction_settings, additionally attempts one batched call to
 * the swappable AiPredictionClient to see if it can supersede individual candidates' results.
 *
 * HARD INVARIANT (see prediction-runs.service.spec.ts "never mutates operational data" test):
 * every write in this file goes through PredictionsRepository (the `predictions` table) or
 * PredictionRunsRepository (the `prediction_runs` table) — nothing here ever calls an insert/
 * update/delete method on StoresRepository, CoursesRepository, or any other module's repository.
 * Those two repositories are read-only dependencies here, used only to validate an optional
 * storeId/courseId filter is within the caller's scope.
 */
@Injectable()
export class PredictionRunsService {
  constructor(
    private readonly settingsRepository: PredictionSettingsRepository,
    private readonly reorderBaselineRepository: ReorderBaselineRepository,
    private readonly riskBaselineRepository: TrainingRiskBaselineRepository,
    private readonly predictionsRepository: PredictionsRepository,
    private readonly runsRepository: PredictionRunsRepository,
    private readonly storesRepository: StoresRepository,
    private readonly coursesRepository: CoursesRepository,
    private readonly scopeService: ScopeService,
    private readonly transaction: TransactionService,
    private readonly audit: AuditService,
    @Inject(AI_PREDICTION_CLIENT) private readonly aiClient: AiPredictionClient,
    @Inject(PREDICTION_RUNS_CLOCK) private readonly clock: () => number,
  ) {}

  async run(dto: PredictionRunRequestDto, actor: AuthenticatedPrincipal): Promise<PredictionRunDto> {
    if (dto.type === PredictionType.REORDER_SUGGESTION) {
      if (!actor.permissions.includes('predictions.reorder.decide')) throw forbidden();
      const scopeIds = this.scopeService.allowedScopeIds(actor);
      return this.runReorder(dto, actor, scopeIds);
    }
    if (!actor.permissions.includes('predictions.risk.decide')) throw forbidden();
    const scopeIds = this.scopeService.allowedScopeIds(actor);
    return this.runTrainingRisk(dto, actor, scopeIds);
  }

  private async runReorder(dto: PredictionRunRequestDto, actor: AuthenticatedPrincipal, scopeIds: string[]): Promise<PredictionRunDto> {
    if (dto.storeId) {
      const store = await this.storesRepository.findScoped(dto.storeId, scopeIds);
      if (!store) throw notFound();
    }
    const startedAt = new Date(this.clock());
    const settings = await this.getSettings();
    const candidates = await this.reorderBaselineRepository.findCandidates(scopeIds, settings.reorder_lookback_weeks, dto.storeId);

    let aiResponse: AiPredictionResponse<AiReorderResult> | null = null;
    let usedFallback = false;
    if (settings.ml_service_enabled && candidates.length > 0) {
      aiResponse = await this.aiClient.predictReorder(candidates.map((c) => this.toAiReorderCandidate(c, settings.reorder_lookback_weeks)));
      if (!aiResponse) usedFallback = true;
    }
    const aiByKey = new Map((aiResponse?.results ?? []).map((r) => [this.reorderKey(r.storeId, r.partId), r]));
    if (settings.ml_service_enabled && candidates.length > 0 && aiResponse && aiByKey.size < candidates.length) usedFallback = true;

    return this.transaction.runInTransaction(async (client) => {
      let generatedCount = 0;
      for (const candidate of candidates) {
        const aiResult = aiByKey.get(this.reorderKey(candidate.store_id, candidate.part_id));
        const ruleResult = computeReorderSuggestion({
          onHand: candidate.on_hand, reserved: candidate.reserved, minLevel: candidate.min_level, maxLevel: candidate.max_level,
          openPurchaseOrderQuantity: candidate.open_po_quantity, averageWeeklyConsumption: candidate.average_weekly_consumption,
        });
        const input = {
          storeId: candidate.store_id, partId: candidate.part_id, partSku: candidate.part_sku,
          onHand: candidate.on_hand, reserved: candidate.reserved, available: candidate.on_hand - candidate.reserved,
          minLevel: candidate.min_level, maxLevel: candidate.max_level, openPurchaseOrderQuantity: candidate.open_po_quantity,
          averageWeeklyConsumption: candidate.average_weekly_consumption, lookbackWeeks: settings.reorder_lookback_weeks,
        };

        await this.predictionsRepository.supersedeActiveReorder(client, candidate.store_id, candidate.part_id);
        await this.predictionsRepository.insertReorder(client, {
          storeId: candidate.store_id,
          partId: candidate.part_id,
          sourceKind: aiResult ? 'ML_MODEL' : 'RULE_BASELINE',
          sourceName: aiResult ? aiResponse!.modelName : 'rule-baseline',
          sourceVersion: aiResult ? aiResponse!.modelVersion : settings.baseline_version,
          explanationSummary: `Available stock (${input.available}) plus open purchase orders (${input.openPurchaseOrderQuantity}) is at or below the minimum level (${input.minLevel}); suggest reordering to reach the maximum level (${input.maxLevel}).`,
          explanationFactors: [
            { code: 'AVAILABLE', message: 'Available stock (on hand minus reserved)', value: String(input.available) },
            { code: 'OPEN_PO_QUANTITY', message: 'Quantity already on open purchase orders', value: String(input.openPurchaseOrderQuantity) },
            { code: 'MIN_LEVEL', message: 'Minimum stock level', value: String(input.minLevel) },
            { code: 'MAX_LEVEL', message: 'Maximum stock level', value: String(input.maxLevel) },
            { code: 'AVERAGE_WEEKLY_CONSUMPTION', message: 'Average weekly consumption', value: input.averageWeeklyConsumption },
          ],
          input,
          suggestedQuantity: aiResult ? aiResult.suggestedQuantity : ruleResult.suggestedQuantity,
          estimatedWeeksOfCover: aiResult ? aiResult.estimatedWeeksOfCover : ruleResult.estimatedWeeksOfCover,
        });
        generatedCount++;
      }

      const finishedAt = new Date(this.clock());
      const mlServiceStatus = this.resolveMlServiceStatus(settings.ml_service_enabled, usedFallback);
      const runSource = this.resolveRunSource(settings, aiResponse, usedFallback);
      const runRow = await this.runsRepository.insert(client, {
        type: 'REORDER_SUGGESTION', ...runSource, startedAt, finishedAt, generatedCount, mlServiceStatus, triggeredBy: actor.id,
      });

      await this.audit.record(client, {
        actorUserId: actor.id, actorRoles: actor.roles, action: 'PREDICTION_RUN.EXECUTE', entityType: 'PREDICTION_RUN', entityId: runRow.id,
        outcome: 'SUCCESS', summary: `Ran REORDER_SUGGESTION baseline: generated ${generatedCount} prediction(s), mlService=${mlServiceStatus}`,
      });

      return mapRun(runRow);
    });
  }

  private async runTrainingRisk(dto: PredictionRunRequestDto, actor: AuthenticatedPrincipal, scopeIds: string[]): Promise<PredictionRunDto> {
    if (dto.courseId) {
      const course = await this.coursesRepository.findScoped(dto.courseId, scopeIds);
      if (!course) throw notFound();
    }
    const startedAt = new Date(this.clock());
    const settings = await this.getSettings();
    const mentorUserId = actor.roles.includes('MENTOR') ? actor.id : undefined;
    const candidates = await this.riskBaselineRepository.findCandidates(scopeIds, dto.courseId, mentorUserId);

    let aiResponse: AiPredictionResponse<AiRiskResult> | null = null;
    let usedFallback = false;
    if (settings.ml_service_enabled && candidates.length > 0) {
      aiResponse = await this.aiClient.predictTrainingRisk(candidates.map((c) => this.toAiRiskCandidate(c)));
      if (!aiResponse) usedFallback = true;
    }
    const aiByKey = new Map((aiResponse?.results ?? []).map((r) => [this.riskKey(r.studentId, r.courseId), r]));
    if (settings.ml_service_enabled && candidates.length > 0 && aiResponse && aiByKey.size < candidates.length) usedFallback = true;

    return this.transaction.runInTransaction(async (client) => {
      let generatedCount = 0;
      for (const candidate of candidates) {
        const aiResult = aiByKey.get(this.riskKey(candidate.student_id, candidate.course_id));
        const missingAttendanceSessions = Math.max(0, candidate.total_sessions - candidate.attended_sessions);
        const attendancePercent = candidate.total_sessions === 0
          ? '100.00'
          : ((candidate.attended_sessions / candidate.total_sessions) * 100).toFixed(2);
        const ruleResult = computeTrainingRisk({
          missingAttendanceSessions, unsignedAssessmentCount: candidate.unsigned_assessment_count, unmetCompetencyCount: candidate.unmet_competency_count,
        });
        const input = {
          studentId: candidate.student_id, courseId: candidate.course_id, attendancePercent,
          missingAttendanceSessions, unsignedAssessmentCount: candidate.unsigned_assessment_count, unmetCompetencyCount: candidate.unmet_competency_count,
        };
        const result = aiResult ? { riskLevel: aiResult.riskLevel, flags: aiResult.flags } : ruleResult;

        await this.predictionsRepository.supersedeActiveRisk(client, candidate.student_id, candidate.course_id);
        await this.predictionsRepository.insertRisk(client, {
          studentId: candidate.student_id,
          courseId: candidate.course_id,
          sourceKind: aiResult ? 'ML_MODEL' : 'RULE_BASELINE',
          sourceName: aiResult ? aiResponse!.modelName : 'rule-baseline',
          sourceVersion: aiResult ? aiResponse!.modelVersion : settings.baseline_version,
          explanationSummary: `${result.flags.length} risk flag(s) found: ${result.flags.join(', ') || 'none'}. Risk level ${result.riskLevel}.`,
          explanationFactors: [
            { code: 'ATTENDANCE_PERCENT', message: 'Attendance percentage', value: attendancePercent },
            { code: 'MISSING_ATTENDANCE_SESSIONS', message: 'Missing attendance sessions', value: String(missingAttendanceSessions) },
            { code: 'UNSIGNED_ASSESSMENT_COUNT', message: 'Unsigned assessments', value: String(candidate.unsigned_assessment_count) },
            { code: 'UNMET_COMPETENCY_COUNT', message: 'Unmet required competencies', value: String(candidate.unmet_competency_count) },
          ],
          input,
          riskLevel: result.riskLevel,
          flags: result.flags,
        });
        generatedCount++;
      }

      const finishedAt = new Date(this.clock());
      const mlServiceStatus = this.resolveMlServiceStatus(settings.ml_service_enabled, usedFallback);
      const runSource = this.resolveRunSource(settings, aiResponse, usedFallback);
      const runRow = await this.runsRepository.insert(client, {
        type: 'TRAINING_RISK', ...runSource, startedAt, finishedAt, generatedCount, mlServiceStatus, triggeredBy: actor.id,
      });

      await this.audit.record(client, {
        actorUserId: actor.id, actorRoles: actor.roles, action: 'PREDICTION_RUN.EXECUTE', entityType: 'PREDICTION_RUN', entityId: runRow.id,
        outcome: 'SUCCESS', summary: `Ran TRAINING_RISK baseline: generated ${generatedCount} prediction(s), mlService=${mlServiceStatus}`,
      });

      return mapRun(runRow);
    });
  }

  private async getSettings(): Promise<PredictionSettingsRow> {
    const settings = await this.settingsRepository.get();
    if (!settings) throw new Error('Prediction settings are not configured');
    return settings;
  }

  private resolveMlServiceStatus(mlServiceEnabled: boolean, usedFallback: boolean): 'NOT_ENABLED' | 'AVAILABLE' | 'UNAVAILABLE_FALLBACK_USED' {
    if (!mlServiceEnabled) return 'NOT_ENABLED';
    return usedFallback ? 'UNAVAILABLE_FALLBACK_USED' : 'AVAILABLE';
  }

  private resolveRunSource(
    settings: PredictionSettingsRow,
    aiResponse: AiPredictionResponse<unknown> | null,
    usedFallback: boolean,
  ): { sourceKind: 'RULE_BASELINE' | 'ML_MODEL'; sourceName: string; sourceVersion: string } {
    if (settings.ml_service_enabled && !usedFallback && aiResponse) {
      return { sourceKind: 'ML_MODEL', sourceName: aiResponse.modelName, sourceVersion: aiResponse.modelVersion };
    }
    return { sourceKind: 'RULE_BASELINE', sourceName: 'rule-baseline', sourceVersion: settings.baseline_version };
  }

  private reorderKey(storeId: string, partId: string): string {
    return `${storeId}:${partId}`;
  }

  private riskKey(studentId: string, courseId: string): string {
    return `${studentId}:${courseId}`;
  }

  private toAiReorderCandidate(row: ReorderCandidateRow, lookbackWeeks: number) {
    return {
      storeId: row.store_id, partId: row.part_id, partSku: row.part_sku, onHand: row.on_hand, reserved: row.reserved,
      available: row.on_hand - row.reserved, minLevel: row.min_level, maxLevel: row.max_level,
      openPurchaseOrderQuantity: row.open_po_quantity, averageWeeklyConsumption: row.average_weekly_consumption, lookbackWeeks,
    };
  }

  private toAiRiskCandidate(row: RiskCandidateRow) {
    const missingAttendanceSessions = Math.max(0, row.total_sessions - row.attended_sessions);
    const attendancePercent = row.total_sessions === 0 ? '100.00' : ((row.attended_sessions / row.total_sessions) * 100).toFixed(2);
    return {
      studentId: row.student_id, courseId: row.course_id, attendancePercent, missingAttendanceSessions,
      unsignedAssessmentCount: row.unsigned_assessment_count, unmetCompetencyCount: row.unmet_competency_count,
    };
  }
}

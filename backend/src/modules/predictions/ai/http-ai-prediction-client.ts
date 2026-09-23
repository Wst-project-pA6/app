import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiPredictionClient,
  AiPredictionResponse,
  AiReorderCandidate,
  AiReorderResult,
  AiRiskCandidate,
  AiRiskResult,
  RiskFlag,
} from './ai-prediction-client';

const RISK_FLAGS = new Set<RiskFlag>(['MISSING_ATTENDANCE', 'UNSIGNED_ASSESSMENTS', 'UNMET_COMPETENCIES']);
const RISK_LEVELS = new Set(['LOW', 'MEDIUM', 'HIGH']);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isValidReorderResult(value: unknown): value is AiReorderResult {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  if (!isNonEmptyString(r.storeId) || !isNonEmptyString(r.partId)) return false;
  if (typeof r.suggestedQuantity !== 'number' || !Number.isInteger(r.suggestedQuantity) || r.suggestedQuantity < 1) return false;
  if (r.estimatedWeeksOfCover !== undefined && typeof r.estimatedWeeksOfCover !== 'string') return false;
  return true;
}

function isValidRiskResult(value: unknown): value is AiRiskResult {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  if (!isNonEmptyString(r.studentId) || !isNonEmptyString(r.courseId)) return false;
  if (typeof r.riskLevel !== 'string' || !RISK_LEVELS.has(r.riskLevel)) return false;
  if (!Array.isArray(r.flags) || !r.flags.every((f) => typeof f === 'string' && RISK_FLAGS.has(f as RiskFlag))) return false;
  return true;
}

function isValidEnvelope(value: unknown): value is { modelName: string; modelVersion: string; results: unknown[] } {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return isNonEmptyString(r.modelName) && isNonEmptyString(r.modelVersion) && Array.isArray(r.results);
}

/**
 * Default AiPredictionClient: an outbound HTTP POST to a configured URL with a hard timeout
 * (AbortSignal.timeout — never an unbounded network call), full response-shape validation, and
 * blanket error handling. ANY failure — no URL configured, DNS/connection error, non-2xx status,
 * timeout, unparsable JSON, or a body that fails validation — is swallowed here and reported as
 * `null`. No exception ever escapes this class, and no response body or error detail from the
 * remote service is ever propagated to the caller (only a generic warning is logged
 * server-side), so a misbehaving or malicious AI service cannot leak internal details into an
 * API response.
 */
@Injectable()
export class HttpAiPredictionClient implements AiPredictionClient {
  private readonly logger = new Logger(HttpAiPredictionClient.name);

  constructor(private readonly configService: ConfigService) {}

  async predictReorder(candidates: AiReorderCandidate[]): Promise<AiPredictionResponse<AiReorderResult> | null> {
    return this.call('reorder', candidates, isValidReorderResult);
  }

  async predictTrainingRisk(candidates: AiRiskCandidate[]): Promise<AiPredictionResponse<AiRiskResult> | null> {
    return this.call('training-risk', candidates, isValidRiskResult);
  }

  private async call<TInput, TResult>(
    kind: string,
    candidates: TInput[],
    isValidResult: (value: unknown) => value is TResult,
  ): Promise<AiPredictionResponse<TResult> | null> {
    const baseUrl = this.configService.get<string>('aiService.url');
    if (!baseUrl) return null; // No AI service configured — treated as unavailable, no network attempt.

    const timeoutMs = this.configService.get<number>('aiService.timeoutMs') ?? 3000;
    try {
      const response = await fetch(`${baseUrl}/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidates }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        this.logger.warn(`AI service returned HTTP ${response.status} for ${kind}`);
        return null;
      }
      const body: unknown = await response.json();
      if (!isValidEnvelope(body)) {
        this.logger.warn(`AI service returned a malformed response envelope for ${kind}`);
        return null;
      }
      const validResults = body.results.filter(isValidResult);
      if (validResults.length !== body.results.length) {
        this.logger.warn(`AI service returned ${body.results.length - validResults.length} malformed result(s) for ${kind}`);
      }
      return { modelName: body.modelName, modelVersion: body.modelVersion, results: validResults };
    } catch (error) {
      this.logger.warn(`AI service call failed for ${kind}: ${error instanceof Error ? error.message : 'unknown error'}`);
      return null;
    }
  }
}

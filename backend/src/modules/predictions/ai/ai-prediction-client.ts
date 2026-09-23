export interface AiReorderCandidate {
  storeId: string;
  partId: string;
  partSku: string;
  onHand: number;
  reserved: number;
  available: number;
  minLevel: number;
  maxLevel: number;
  openPurchaseOrderQuantity: number;
  averageWeeklyConsumption: string;
  lookbackWeeks: number;
}

export interface AiReorderResult {
  storeId: string;
  partId: string;
  suggestedQuantity: number;
  estimatedWeeksOfCover?: string;
}

export interface AiRiskCandidate {
  studentId: string;
  courseId: string;
  attendancePercent: string;
  missingAttendanceSessions: number;
  unsignedAssessmentCount: number;
  unmetCompetencyCount: number;
}

export type RiskFlag = 'MISSING_ATTENDANCE' | 'UNSIGNED_ASSESSMENTS' | 'UNMET_COMPETENCIES';

export interface AiRiskResult {
  studentId: string;
  courseId: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  flags: RiskFlag[];
}

export interface AiPredictionResponse<TResult> {
  modelName: string;
  modelVersion: string;
  results: TResult[];
}

export const AI_PREDICTION_CLIENT = Symbol('AI_PREDICTION_CLIENT');

/**
 * Small, swappable boundary between the deterministic rule baseline (which always runs — see
 * prediction-runs.service.ts) and an optional external AI/ML service. Every method returns
 * `null` — never throws — for ANY failure: the service disabled/unconfigured, unreachable,
 * timed out, or returning a response that fails shape validation. Callers treat `null` exactly
 * like "unavailable" and fall back to the rule baseline; this interface is the ONLY place that
 * knows how to talk to an external AI service, so swapping providers means writing one new class
 * against this same interface, never touching prediction-runs.service.ts.
 */
export interface AiPredictionClient {
  predictReorder(candidates: AiReorderCandidate[]): Promise<AiPredictionResponse<AiReorderResult> | null>;
  predictTrainingRisk(candidates: AiRiskCandidate[]): Promise<AiPredictionResponse<AiRiskResult> | null>;
}

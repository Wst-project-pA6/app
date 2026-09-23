import { RiskFlag } from './ai/ai-prediction-client';

export interface RiskRuleInput {
  missingAttendanceSessions: number;
  unsignedAssessmentCount: number;
  unmetCompetencyCount: number;
}

export interface RiskRuleResult {
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  flags: RiskFlag[];
}

/**
 * Deterministic training-risk rule baseline (WST-FR-14): "flags missing attendance, unsigned
 * assessments and unmet competencies (0 flags LOW, 1 MEDIUM, 2 or more HIGH)".
 */
export function computeTrainingRisk(input: RiskRuleInput): RiskRuleResult {
  const flags: RiskFlag[] = [];
  if (input.missingAttendanceSessions > 0) flags.push('MISSING_ATTENDANCE');
  if (input.unsignedAssessmentCount > 0) flags.push('UNSIGNED_ASSESSMENTS');
  if (input.unmetCompetencyCount > 0) flags.push('UNMET_COMPETENCIES');

  const riskLevel = flags.length === 0 ? 'LOW' : flags.length === 1 ? 'MEDIUM' : 'HIGH';
  return { riskLevel, flags };
}

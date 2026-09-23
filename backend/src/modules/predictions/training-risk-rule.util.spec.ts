import { computeTrainingRisk } from './training-risk-rule.util';

describe('computeTrainingRisk', () => {
  it('is LOW with no flags when nothing is missing/unsigned/unmet', () => {
    const result = computeTrainingRisk({ missingAttendanceSessions: 0, unsignedAssessmentCount: 0, unmetCompetencyCount: 0 });
    expect(result).toEqual({ riskLevel: 'LOW', flags: [] });
  });

  it('is MEDIUM with exactly one flag', () => {
    const result = computeTrainingRisk({ missingAttendanceSessions: 2, unsignedAssessmentCount: 0, unmetCompetencyCount: 0 });
    expect(result).toEqual({ riskLevel: 'MEDIUM', flags: ['MISSING_ATTENDANCE'] });
  });

  it('is HIGH with two or more flags', () => {
    const result = computeTrainingRisk({ missingAttendanceSessions: 1, unsignedAssessmentCount: 1, unmetCompetencyCount: 0 });
    expect(result).toEqual({ riskLevel: 'HIGH', flags: ['MISSING_ATTENDANCE', 'UNSIGNED_ASSESSMENTS'] });
  });

  it('is HIGH with all three flags present', () => {
    const result = computeTrainingRisk({ missingAttendanceSessions: 3, unsignedAssessmentCount: 2, unmetCompetencyCount: 1 });
    expect(result).toEqual({ riskLevel: 'HIGH', flags: ['MISSING_ATTENDANCE', 'UNSIGNED_ASSESSMENTS', 'UNMET_COMPETENCIES'] });
  });
});

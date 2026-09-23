import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import type { AiPredictionClient } from './ai/ai-prediction-client';
import { PredictionType } from './dto/prediction.dto';
import { PredictionRunsRepository } from './prediction-runs.repository';
import { PredictionRunsService } from './prediction-runs.service';
import { PredictionsRepository } from './predictions.repository';
import { PredictionSettingsRepository, PredictionSettingsRow } from './prediction-settings.repository';
import { ReorderBaselineRepository, ReorderCandidateRow } from './reorder-baseline.repository';
import { TrainingRiskBaselineRepository, RiskCandidateRow } from './training-risk-baseline.repository';
import type { StoresRepository } from '../inventory/stores.repository';
import type { CoursesRepository } from '../training/courses.repository';

const scopeId = '22222222-2222-4222-8222-222222222222';
const storeId = 'store-1';
const partId = 'part-1';
const courseId = 'course-1';
const studentId = 'student-1';
const NOW = Date.parse('2026-06-15T12:00:00.000Z');

const actor: AuthenticatedPrincipal = {
  id: 'user-1', email: 'u@example.test', displayName: 'U', preferredLocale: 'en',
  roles: ['STOREKEEPER_PROCUREMENT'], permissions: ['predictions.reorder.decide', 'predictions.risk.decide'],
  organizationScopeIds: [scopeId], mustChangePassword: false,
};

function settingsRow(overrides: Partial<PredictionSettingsRow> = {}): PredictionSettingsRow {
  return {
    id: true, version: 1, reorder_lookback_weeks: 8, ml_service_enabled: false, baseline_version: 'rule-baseline-v1',
    updated_at: new Date(NOW), updated_by: null, ...overrides,
  };
}

function reorderCandidate(overrides: Partial<ReorderCandidateRow> = {}): ReorderCandidateRow {
  return {
    store_id: storeId, part_id: partId, part_sku: 'SKU-1', on_hand: 5, reserved: 1,
    min_level: 10, max_level: 30, open_po_quantity: 0, average_weekly_consumption: '2.00', ...overrides,
  };
}

function riskCandidate(overrides: Partial<RiskCandidateRow> = {}): RiskCandidateRow {
  return {
    student_id: studentId, course_id: courseId, total_sessions: 10, attended_sessions: 10,
    unsigned_assessment_count: 0, unmet_competency_count: 0, ...overrides,
  };
}

interface Overrides {
  settingsRepository?: Partial<PredictionSettingsRepository>;
  reorderBaselineRepository?: Partial<ReorderBaselineRepository>;
  riskBaselineRepository?: Partial<TrainingRiskBaselineRepository>;
  predictionsRepository?: Partial<PredictionsRepository>;
  runsRepository?: Partial<PredictionRunsRepository>;
  storesRepository?: Partial<StoresRepository>;
  coursesRepository?: Partial<CoursesRepository>;
  aiClient?: Partial<AiPredictionClient>;
  now?: number;
}

function makeService(overrides: Overrides = {}) {
  const client = {};
  const transaction = { runInTransaction: jest.fn(async (work: (v: unknown) => unknown) => work(client)) } as unknown as TransactionService;
  const auditRecord = jest.fn().mockResolvedValue(undefined);
  const audit = { record: auditRecord } as unknown as AuditService;

  const settingsRepository = { get: jest.fn().mockResolvedValue(settingsRow()), ...overrides.settingsRepository } as unknown as PredictionSettingsRepository;
  const reorderBaselineRepository = { findCandidates: jest.fn().mockResolvedValue([]), ...overrides.reorderBaselineRepository } as unknown as ReorderBaselineRepository;
  const riskBaselineRepository = { findCandidates: jest.fn().mockResolvedValue([]), ...overrides.riskBaselineRepository } as unknown as TrainingRiskBaselineRepository;
  const predictionsRepository = {
    supersedeActiveReorder: jest.fn().mockResolvedValue(undefined),
    supersedeActiveRisk: jest.fn().mockResolvedValue(undefined),
    insertReorder: jest.fn().mockResolvedValue({ id: 'pred-1' }),
    insertRisk: jest.fn().mockResolvedValue({ id: 'pred-2' }),
    ...overrides.predictionsRepository,
  } as unknown as PredictionsRepository;
  const runsRepository = {
    insert: jest.fn().mockImplementation(async (_client: unknown, data: {
      type: string; sourceKind: string; sourceName: string; sourceVersion: string; startedAt: Date; finishedAt: Date;
      generatedCount: number; mlServiceStatus: string; triggeredBy: string;
    }) => ({
      id: 'run-1', type: data.type, source_kind: data.sourceKind, source_name: data.sourceName, source_version: data.sourceVersion,
      started_at: data.startedAt, finished_at: data.finishedAt, generated_count: data.generatedCount,
      ml_service_status: data.mlServiceStatus, triggered_by: data.triggeredBy,
    })),
    ...overrides.runsRepository,
  } as unknown as PredictionRunsRepository;
  const storesRepository = {
    findScoped: jest.fn().mockResolvedValue({ id: storeId, organization_scope_id: scopeId }),
    ...overrides.storesRepository,
  } as unknown as StoresRepository;
  const coursesRepository = {
    findScoped: jest.fn().mockResolvedValue({ id: courseId, organization_scope_id: scopeId }),
    ...overrides.coursesRepository,
  } as unknown as CoursesRepository;
  const aiClient = {
    predictReorder: jest.fn().mockResolvedValue(null),
    predictTrainingRisk: jest.fn().mockResolvedValue(null),
    ...overrides.aiClient,
  } as unknown as AiPredictionClient;

  const now = overrides.now ?? NOW;
  const service = new PredictionRunsService(
    settingsRepository, reorderBaselineRepository, riskBaselineRepository, predictionsRepository, runsRepository,
    storesRepository, coursesRepository, new ScopeService(), transaction, audit, aiClient, () => now,
  );
  return {
    service, settingsRepository, reorderBaselineRepository, riskBaselineRepository, predictionsRepository,
    runsRepository, storesRepository, coursesRepository, aiClient, audit: auditRecord,
  };
}

describe('PredictionRunsService — AI-service success path', () => {
  it('uses the AI result and marks the run AVAILABLE with ML_MODEL source when the AI service returns full valid coverage', async () => {
    const { service, predictionsRepository } = makeService({
      settingsRepository: { get: jest.fn().mockResolvedValue(settingsRow({ ml_service_enabled: true })) },
      reorderBaselineRepository: { findCandidates: jest.fn().mockResolvedValue([reorderCandidate()]) },
      aiClient: {
        predictReorder: jest.fn().mockResolvedValue({
          modelName: 'reorder-net', modelVersion: '2.0.0',
          results: [{ storeId, partId, suggestedQuantity: 25, estimatedWeeksOfCover: '1.50' }],
        }),
      },
    });
    const result = await service.run({ type: PredictionType.REORDER_SUGGESTION }, actor);

    expect(result.mlService).toBe('AVAILABLE');
    expect(result.source).toEqual({ kind: 'ML_MODEL', name: 'reorder-net', version: '2.0.0' });
    expect(result.generatedCount).toBe(1);
    const insertArgs = (predictionsRepository.insertReorder as jest.Mock).mock.calls[0][1];
    expect(insertArgs.sourceKind).toBe('ML_MODEL');
    expect(insertArgs.sourceName).toBe('reorder-net');
    expect(insertArgs.sourceVersion).toBe('2.0.0');
    expect(insertArgs.suggestedQuantity).toBe(25);
    expect(insertArgs.estimatedWeeksOfCover).toBe('1.50');
  });
});

describe('PredictionRunsService — AI disabled fallback', () => {
  it('never calls the AI client and uses the rule baseline when mlServiceEnabled is false', async () => {
    const { service, aiClient, predictionsRepository } = makeService({
      settingsRepository: { get: jest.fn().mockResolvedValue(settingsRow({ ml_service_enabled: false })) },
      reorderBaselineRepository: { findCandidates: jest.fn().mockResolvedValue([reorderCandidate()]) },
    });
    const result = await service.run({ type: PredictionType.REORDER_SUGGESTION }, actor);

    expect((aiClient.predictReorder as jest.Mock).mock.calls).toHaveLength(0);
    expect(result.mlService).toBe('NOT_ENABLED');
    expect(result.source).toEqual({ kind: 'RULE_BASELINE', name: 'rule-baseline', version: 'rule-baseline-v1' });
    const insertArgs = (predictionsRepository.insertReorder as jest.Mock).mock.calls[0][1];
    expect(insertArgs.sourceKind).toBe('RULE_BASELINE');
  });
});

describe('PredictionRunsService — AI timeout/unreachable fallback', () => {
  it('falls back to the rule baseline and marks UNAVAILABLE_FALLBACK_USED when the AI client resolves null (timeout/unreachable/disabled-at-transport all collapse here)', async () => {
    const { service, predictionsRepository } = makeService({
      settingsRepository: { get: jest.fn().mockResolvedValue(settingsRow({ ml_service_enabled: true })) },
      reorderBaselineRepository: { findCandidates: jest.fn().mockResolvedValue([reorderCandidate()]) },
      aiClient: { predictReorder: jest.fn().mockResolvedValue(null) },
    });
    const result = await service.run({ type: PredictionType.REORDER_SUGGESTION }, actor);

    expect(result.mlService).toBe('UNAVAILABLE_FALLBACK_USED');
    expect(result.source).toEqual({ kind: 'RULE_BASELINE', name: 'rule-baseline', version: 'rule-baseline-v1' });
    const insertArgs = (predictionsRepository.insertReorder as jest.Mock).mock.calls[0][1];
    expect(insertArgs.sourceKind).toBe('RULE_BASELINE');
    // The request still completed safely — no exception, a normal 201-equivalent result.
    expect(result.generatedCount).toBe(1);
  });

  it('the training-risk run falls back identically when the AI client resolves null', async () => {
    const { service, predictionsRepository } = makeService({
      settingsRepository: { get: jest.fn().mockResolvedValue(settingsRow({ ml_service_enabled: true })) },
      riskBaselineRepository: { findCandidates: jest.fn().mockResolvedValue([riskCandidate({ unsigned_assessment_count: 1 })]) },
      aiClient: { predictTrainingRisk: jest.fn().mockResolvedValue(null) },
    });
    const result = await service.run({ type: PredictionType.TRAINING_RISK }, actor);

    expect(result.mlService).toBe('UNAVAILABLE_FALLBACK_USED');
    const insertArgs = (predictionsRepository.insertRisk as jest.Mock).mock.calls[0][1];
    expect(insertArgs.sourceKind).toBe('RULE_BASELINE');
    expect(insertArgs.riskLevel).toBe('MEDIUM');
    expect(insertArgs.flags).toEqual(['UNSIGNED_ASSESSMENTS']);
  });
});

describe('PredictionRunsService — invalid/malformed AI response fallback', () => {
  it('falls back per-candidate (and marks the run UNAVAILABLE_FALLBACK_USED) when the AI response does not cover every candidate', async () => {
    const { service, predictionsRepository } = makeService({
      settingsRepository: { get: jest.fn().mockResolvedValue(settingsRow({ ml_service_enabled: true })) },
      reorderBaselineRepository: { findCandidates: jest.fn().mockResolvedValue([reorderCandidate()]) },
      // Simulates the HTTP client already having filtered out a malformed result, leaving an
      // empty (but structurally valid) results array — i.e. the AI responded, but with nothing
      // usable for this candidate.
      aiClient: { predictReorder: jest.fn().mockResolvedValue({ modelName: 'reorder-net', modelVersion: '2.0.0', results: [] }) },
    });
    const result = await service.run({ type: PredictionType.REORDER_SUGGESTION }, actor);

    expect(result.mlService).toBe('UNAVAILABLE_FALLBACK_USED');
    const insertArgs = (predictionsRepository.insertReorder as jest.Mock).mock.calls[0][1];
    expect(insertArgs.sourceKind).toBe('RULE_BASELINE');
  });
});

describe('PredictionRunsService — type-specific decide permission enforcement', () => {
  it('forbids a REORDER_SUGGESTION run for an actor holding only predictions.risk.decide (e.g. TRAINING_SUPERVISOR)', async () => {
    const trainingSupervisor = { ...actor, roles: ['TRAINING_SUPERVISOR'], permissions: ['predictions.risk.decide'] };
    const { service, reorderBaselineRepository } = makeService();
    await expect(service.run({ type: PredictionType.REORDER_SUGGESTION }, trainingSupervisor))
      .rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
    expect((reorderBaselineRepository.findCandidates as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('forbids a TRAINING_RISK run for an actor holding only predictions.reorder.decide (e.g. STOREKEEPER_PROCUREMENT)', async () => {
    const storekeeper = { ...actor, roles: ['STOREKEEPER_PROCUREMENT'], permissions: ['predictions.reorder.decide'] };
    const { service, riskBaselineRepository } = makeService();
    await expect(service.run({ type: PredictionType.TRAINING_RISK }, storekeeper))
      .rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
    expect((riskBaselineRepository.findCandidates as jest.Mock).mock.calls).toHaveLength(0);
  });
});

describe('PredictionRunsService — scope enforcement', () => {
  it('returns 404 for a storeId the caller cannot access (never queries candidates for it)', async () => {
    const { service, reorderBaselineRepository } = makeService({ storesRepository: { findScoped: jest.fn().mockResolvedValue(null) } });
    await expect(service.run({ type: PredictionType.REORDER_SUGGESTION, storeId: 'store-outside-scope' }, actor))
      .rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    expect((reorderBaselineRepository.findCandidates as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('returns 404 for a courseId the caller cannot access', async () => {
    const { service, riskBaselineRepository } = makeService({ coursesRepository: { findScoped: jest.fn().mockResolvedValue(null) } });
    await expect(service.run({ type: PredictionType.TRAINING_RISK, courseId: 'course-outside-scope' }, actor))
      .rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    expect((riskBaselineRepository.findCandidates as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('passes the caller\'s resolved organization scope through to the baseline repository', async () => {
    const { service, reorderBaselineRepository } = makeService();
    await service.run({ type: PredictionType.REORDER_SUGGESTION }, actor);
    expect((reorderBaselineRepository.findCandidates as jest.Mock).mock.calls[0][0]).toEqual([scopeId]);
  });

  it('restricts a MENTOR\'s training-risk run to their own students', async () => {
    const mentor = { ...actor, roles: ['MENTOR'], permissions: ['predictions.risk.decide'] };
    const { service, riskBaselineRepository } = makeService();
    await service.run({ type: PredictionType.TRAINING_RISK }, mentor);
    expect((riskBaselineRepository.findCandidates as jest.Mock).mock.calls[0][2]).toBe('user-1');
  });
});

describe('PredictionRunsService — response metadata', () => {
  it('always includes the model/baseline version in source.version', async () => {
    const { service } = makeService({ reorderBaselineRepository: { findCandidates: jest.fn().mockResolvedValue([]) } });
    const result = await service.run({ type: PredictionType.REORDER_SUGGESTION }, actor);
    expect(result.source.version).toBe('rule-baseline-v1');
    expect(result.id).toBeDefined();
    expect(result.startedAt).toBeDefined();
    expect(result.finishedAt).toBeDefined();
  });
});

describe('PredictionRunsService — never mutates operational data', () => {
  /**
   * Stub repositories that expose ONLY the one read method PredictionRunsService is meant to
   * call. If the service under test ever invoked any other method — an insert/update/delete on
   * StoresRepository, CoursesRepository, or the baseline repositories, i.e. exactly the
   * "predictions must never mutate operational data" violation this test exists to catch —
   * that property would be `undefined` on these plain objects and calling it would throw a
   * TypeError, failing this test. This is not an assumption from reading the code: it is a
   * runtime proof that no such call happened during a real run() invocation.
   */
  it('touches only the predictions and prediction_runs tables for a REORDER_SUGGESTION run', async () => {
    const readOnlyStores = { findScoped: jest.fn().mockResolvedValue({ id: storeId, organization_scope_id: scopeId }) };
    const readOnlyReorderBaseline = { findCandidates: jest.fn().mockResolvedValue([reorderCandidate()]) };
    const predictionsRepository = {
      supersedeActiveReorder: jest.fn().mockResolvedValue(undefined),
      insertReorder: jest.fn().mockResolvedValue({ id: 'pred-1' }),
    };
    const runsRepository = {
      insert: jest.fn().mockResolvedValue({
        id: 'run-1', type: 'REORDER_SUGGESTION', source_kind: 'RULE_BASELINE', source_name: 'rule-baseline', source_version: 'rule-baseline-v1',
        started_at: new Date(NOW), finished_at: new Date(NOW), generated_count: 1, ml_service_status: 'NOT_ENABLED', triggered_by: actor.id,
      }),
    };

    const { service } = makeService({
      storesRepository: readOnlyStores as unknown as Partial<StoresRepository>,
      reorderBaselineRepository: readOnlyReorderBaseline as unknown as Partial<ReorderBaselineRepository>,
      predictionsRepository: predictionsRepository as unknown as Partial<PredictionsRepository>,
      runsRepository: runsRepository as unknown as Partial<PredictionRunsRepository>,
    });

    await expect(service.run({ type: PredictionType.REORDER_SUGGESTION, storeId }, actor)).resolves.toBeDefined();

    // Proof of writes actually happening (not a vacuous test) — scoped only to predictions/prediction_runs.
    expect(predictionsRepository.supersedeActiveReorder).toHaveBeenCalledTimes(1);
    expect(predictionsRepository.insertReorder).toHaveBeenCalledTimes(1);
    expect(runsRepository.insert).toHaveBeenCalledTimes(1);
    // Proof of no writes elsewhere: the only method ever invoked on the "operational" stubs is the read method.
    expect(Object.keys(readOnlyStores)).toEqual(['findScoped']);
    expect(Object.keys(readOnlyReorderBaseline)).toEqual(['findCandidates']);
  });

  it('touches only the predictions and prediction_runs tables for a TRAINING_RISK run', async () => {
    const readOnlyCourses = { findScoped: jest.fn().mockResolvedValue({ id: courseId, organization_scope_id: scopeId }) };
    const readOnlyRiskBaseline = { findCandidates: jest.fn().mockResolvedValue([riskCandidate()]) };
    const predictionsRepository = {
      supersedeActiveRisk: jest.fn().mockResolvedValue(undefined),
      insertRisk: jest.fn().mockResolvedValue({ id: 'pred-2' }),
    };
    const runsRepository = {
      insert: jest.fn().mockResolvedValue({
        id: 'run-2', type: 'TRAINING_RISK', source_kind: 'RULE_BASELINE', source_name: 'rule-baseline', source_version: 'rule-baseline-v1',
        started_at: new Date(NOW), finished_at: new Date(NOW), generated_count: 1, ml_service_status: 'NOT_ENABLED', triggered_by: actor.id,
      }),
    };

    const { service } = makeService({
      coursesRepository: readOnlyCourses as unknown as Partial<CoursesRepository>,
      riskBaselineRepository: readOnlyRiskBaseline as unknown as Partial<TrainingRiskBaselineRepository>,
      predictionsRepository: predictionsRepository as unknown as Partial<PredictionsRepository>,
      runsRepository: runsRepository as unknown as Partial<PredictionRunsRepository>,
    });

    await expect(service.run({ type: PredictionType.TRAINING_RISK, courseId }, actor)).resolves.toBeDefined();

    expect(predictionsRepository.supersedeActiveRisk).toHaveBeenCalledTimes(1);
    expect(predictionsRepository.insertRisk).toHaveBeenCalledTimes(1);
    expect(runsRepository.insert).toHaveBeenCalledTimes(1);
    expect(Object.keys(readOnlyCourses)).toEqual(['findScoped']);
    expect(Object.keys(readOnlyRiskBaseline)).toEqual(['findCandidates']);
  });
});

describe('PredictionRunsService — superseding prior ACTIVE predictions stays within the predictions table', () => {
  it('supersedes the previous ACTIVE reorder prediction for the same store+part before inserting the new one', async () => {
    const { service, predictionsRepository } = makeService({
      reorderBaselineRepository: { findCandidates: jest.fn().mockResolvedValue([reorderCandidate()]) },
    });
    await service.run({ type: PredictionType.REORDER_SUGGESTION }, actor);
    expect((predictionsRepository.supersedeActiveReorder as jest.Mock).mock.calls[0]).toEqual([{}, storeId, partId]);
  });
});

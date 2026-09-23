import { ScopeService } from '../../common/auth/scope.service';
import { AuditService } from '../../common/audit/audit.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { PredictionDecision } from './dto/prediction.dto';
import { PredictionRow, PredictionsRepository } from './predictions.repository';
import { PredictionsService } from './predictions.service';

const scopeId = '22222222-2222-4222-8222-222222222222';
const predictionId = '11111111-1111-4111-8111-111111111111';

function actorWith(permissions: string[], roles: string[] = ['WORKSHOP_MANAGER']): AuthenticatedPrincipal {
  return {
    id: 'user-1', email: 'u@example.test', displayName: 'U', preferredLocale: 'en',
    roles, permissions, organizationScopeIds: [scopeId], mustChangePassword: false,
  };
}

function reorderRow(overrides: Partial<PredictionRow> = {}): PredictionRow {
  return {
    id: predictionId, type: 'REORDER_SUGGESTION', status: 'ACTIVE', generated_at: new Date('2026-01-01T00:00:00Z'),
    source_kind: 'RULE_BASELINE', source_name: 'rule-baseline', source_version: 'rule-baseline-v1',
    explanation_summary: 'summary', explanation_factors: [],
    store_id: 'store-1', part_id: 'part-1', reorder_input: { storeId: 'store-1' }, reorder_suggested_quantity: 10,
    reorder_estimated_weeks_of_cover: '2.00',
    student_id: null, course_id: null, risk_input: null, risk_level: null, risk_flags: null,
    decision: null, decided_by: null, decided_at: null, override_reason: null, override_quantity: null, decision_note: null,
    evaluation_outcome: 'PENDING', evaluated_at: null, evaluation_note: null,
    ...overrides,
  };
}

function makeService(overrides: { repository?: Partial<PredictionsRepository> } = {}) {
  const auditRecord = jest.fn().mockResolvedValue(undefined);
  const audit = { record: auditRecord } as unknown as AuditService;
  const client = {};
  const transaction = { runInTransaction: jest.fn(async (work: (v: unknown) => unknown) => work(client)) } as unknown as TransactionService;
  const repository = {
    list: jest.fn().mockResolvedValue({ rows: [], totalItems: 0 }),
    findScoped: jest.fn().mockResolvedValue(null),
    recordDecision: jest.fn(),
    ...overrides.repository,
  } as unknown as PredictionsRepository;
  const service = new PredictionsService(repository, new ScopeService(), transaction, audit);
  return { service, repository, audit: auditRecord };
}

describe('PredictionsService — advisory-only labeling', () => {
  it('every mapped prediction carries advisoryOnly: true regardless of type or decision', async () => {
    const { service } = makeService({ repository: { findScoped: jest.fn().mockResolvedValue(reorderRow()) } });
    const result = await service.get(predictionId, actorWith(['predictions.reorder.read']));
    expect(result.advisoryOnly).toBe(true);
  });
});

describe('PredictionsService.get — scope and permission enforcement', () => {
  it('passes the caller\'s reorder/risk read permissions and resolved scope to the repository', async () => {
    const { service, repository } = makeService({ repository: { findScoped: jest.fn().mockResolvedValue(reorderRow()) } });
    await service.get(predictionId, actorWith(['predictions.reorder.read']));
    const call = (repository.findScoped as jest.Mock).mock.calls[0];
    expect(call[0]).toBe(predictionId);
    expect(call[1]).toEqual([scopeId]);
    expect(call[2]).toBe(true); // canReadReorder
    expect(call[3]).toBe(false); // canReadRisk
  });

  it('returns 404 (never leaking existence) for a row the repository could not resolve within scope/permission', async () => {
    const { service } = makeService({ repository: { findScoped: jest.fn().mockResolvedValue(null) } });
    await expect(service.get(predictionId, actorWith(['predictions.reorder.read']))).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('restricts risk predictions to a MENTOR\'s own students by passing mentorUserId, but not for TRAINING_SUPERVISOR', async () => {
    const { service, repository } = makeService({ repository: { findScoped: jest.fn().mockResolvedValue(reorderRow()) } });
    await service.get(predictionId, actorWith(['predictions.risk.read'], ['MENTOR']));
    expect((repository.findScoped as jest.Mock).mock.calls[0][4]).toBe('user-1');

    await service.get(predictionId, actorWith(['predictions.risk.read'], ['TRAINING_SUPERVISOR']));
    expect((repository.findScoped as jest.Mock).mock.calls[1][4]).toBeUndefined();
  });
});

describe('PredictionsService.list — scope and permission enforcement', () => {
  it('resolves scope via ScopeService and forwards both read-permission flags', async () => {
    const { service, repository } = makeService();
    await service.list({ page: 1, pageSize: 20 }, actorWith(['predictions.reorder.read', 'predictions.risk.read']));
    const call = (repository.list as jest.Mock).mock.calls[0];
    expect(call[1]).toEqual([scopeId]);
    expect(call[2]).toBe(true);
    expect(call[3]).toBe(true);
  });

  it('translates a repository INVALID_SORT into 400 BAD_REQUEST', async () => {
    const { service } = makeService({ repository: { list: jest.fn().mockRejectedValue(new Error('INVALID_SORT')) } });
    await expect(service.list({ page: 1, pageSize: 20, sort: 'status' as never }, actorWith(['predictions.reorder.read'])))
      .rejects.toMatchObject({ code: ErrorCode.BAD_REQUEST });
  });
});

describe('PredictionsService.decide — human decision recording', () => {
  it('requires overrideReason when decision is OVERRIDDEN (422)', async () => {
    const { service } = makeService();
    await expect(
      service.decide(predictionId, { decision: PredictionDecision.OVERRIDDEN }, actorWith(['predictions.reorder.decide'])),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('rejects deciding a non-ACTIVE prediction with 409 INVALID_STATE_TRANSITION', async () => {
    const { service } = makeService({ repository: { findScoped: jest.fn().mockResolvedValue(reorderRow({ status: 'ACCEPTED' })) } });
    await expect(
      service.decide(predictionId, { decision: PredictionDecision.ACCEPTED }, actorWith(['predictions.reorder.decide'])),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_STATE_TRANSITION });
  });

  it('returns 404 for a prediction outside the caller\'s decide-scope/type (never 403, to avoid leaking existence)', async () => {
    const { service } = makeService({ repository: { findScoped: jest.fn().mockResolvedValue(null) } });
    await expect(
      service.decide(predictionId, { decision: PredictionDecision.ACCEPTED }, actorWith(['predictions.reorder.decide'])),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('records the decision (status/decidedBy/overrideReason/overrideQuantity/note) and audits PREDICTION.DECIDE', async () => {
    const { service, repository, audit } = makeService({
      repository: {
        findScoped: jest.fn().mockResolvedValue(reorderRow()),
        recordDecision: jest.fn().mockResolvedValue(reorderRow({ status: 'OVERRIDDEN', decision: 'OVERRIDDEN', decided_by: 'user-1', decided_at: new Date(), override_reason: 'wrong quantity', override_quantity: 5 })),
      },
    });
    const actor = actorWith(['predictions.reorder.decide']);
    const result = await service.decide(predictionId, { decision: PredictionDecision.OVERRIDDEN, overrideReason: 'wrong quantity', overrideQuantity: 5 }, actor);

    expect((repository.recordDecision as jest.Mock).mock.calls[0][1]).toBe(predictionId);
    expect((repository.recordDecision as jest.Mock).mock.calls[0][2]).toEqual({
      status: 'OVERRIDDEN', decidedBy: 'user-1', overrideReason: 'wrong quantity', overrideQuantity: 5, note: undefined,
    });
    expect(result.decision).toMatchObject({ decision: 'OVERRIDDEN', decidedBy: 'user-1', overrideReason: 'wrong quantity', overrideQuantity: 5 });
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'PREDICTION.DECIDE' }));
  });
});

import { AuditService } from '../../common/audit/audit.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { PredictionSettingsRepository, PredictionSettingsRow } from './prediction-settings.repository';
import { PredictionSettingsService } from './prediction-settings.service';

const actor: AuthenticatedPrincipal = {
  id: 'admin-1', email: 'a@example.test', displayName: 'Admin', preferredLocale: 'en',
  roles: ['SYSTEM_ADMIN'], permissions: ['config.read', 'config.manage'], organizationScopeIds: [], mustChangePassword: false,
};

function settingsRow(overrides: Partial<PredictionSettingsRow> = {}): PredictionSettingsRow {
  return {
    id: true, version: 1, reorder_lookback_weeks: 8, ml_service_enabled: false, baseline_version: 'rule-baseline-v1',
    updated_at: new Date(), updated_by: null, ...overrides,
  };
}

function makeService(overrides: { repository?: Partial<PredictionSettingsRepository> } = {}) {
  const auditRecord = jest.fn().mockResolvedValue(undefined);
  const audit = { record: auditRecord } as unknown as AuditService;
  const client = {};
  const transaction = { runInTransaction: jest.fn(async (work: (v: unknown) => unknown) => work(client)) } as unknown as TransactionService;
  const repository = {
    get: jest.fn().mockResolvedValue(settingsRow()),
    lock: jest.fn().mockResolvedValue(settingsRow()),
    update: jest.fn().mockResolvedValue(settingsRow({ version: 2, reorder_lookback_weeks: 4, ml_service_enabled: true })),
    ...overrides.repository,
  } as unknown as PredictionSettingsRepository;
  const service = new PredictionSettingsService(repository, transaction, audit);
  return { service, repository, audit: auditRecord };
}

describe('PredictionSettingsService.get', () => {
  it('maps the singleton row, including the read-only baselineVersion', async () => {
    const { service } = makeService();
    await expect(service.get()).resolves.toEqual({
      version: 1, reorderLookbackWeeks: 8, mlServiceEnabled: false, baselineVersion: 'rule-baseline-v1',
    });
  });

  it('404s if the singleton row is somehow missing', async () => {
    const { service } = makeService({ repository: { get: jest.fn().mockResolvedValue(null) } });
    await expect(service.get()).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });
});

describe('PredictionSettingsService.replace', () => {
  it('rejects a stale version with 409 VERSION_CONFLICT', async () => {
    const { service } = makeService({ repository: { lock: jest.fn().mockResolvedValue(settingsRow({ version: 5 })) } });
    await expect(service.replace({ version: 1, reorderLookbackWeeks: 4, mlServiceEnabled: true }, actor))
      .rejects.toMatchObject({ code: ErrorCode.VERSION_CONFLICT });
  });

  it('updates and audits CONFIG.PREDICTION_SETTINGS.UPDATE', async () => {
    const { service, repository, audit } = makeService();
    const result = await service.replace({ version: 1, reorderLookbackWeeks: 4, mlServiceEnabled: true }, actor);
    expect(result).toEqual({ version: 2, reorderLookbackWeeks: 4, mlServiceEnabled: true, baselineVersion: 'rule-baseline-v1' });
    expect((repository.update as jest.Mock).mock.calls[0][1]).toEqual({ reorderLookbackWeeks: 4, mlServiceEnabled: true, actorId: 'admin-1' });
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'CONFIG.PREDICTION_SETTINGS.UPDATE' }));
  });
});

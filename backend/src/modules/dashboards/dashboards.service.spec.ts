import { ScopeService } from '../../common/auth/scope.service';
import { computeFilterFingerprint } from '../../common/reports/filter-fingerprint.util';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { DashboardsRepository } from './dashboards.repository';
import { DashboardsService } from './dashboards.service';
import { RawMetric } from './dto/dashboard.dto';

const scopeId = '22222222-2222-4222-8222-222222222222';
const otherScopeId = '33333333-3333-4333-8333-333333333333';
const NOW = Date.parse('2026-06-15T12:00:00.000Z');

function actorWith(permissions: string[]): AuthenticatedPrincipal {
  return {
    id: 'user-1', email: 'u@example.test', displayName: 'U', preferredLocale: 'en',
    roles: ['WORKSHOP_MANAGER'], permissions, organizationScopeIds: [scopeId], mustChangePassword: false,
  };
}

function makeService(overrides: { repository?: Partial<DashboardsRepository> } = {}) {
  const repository = {
    getWorkshopMetrics: jest.fn().mockResolvedValue([]),
    getInventoryFinanceMetrics: jest.fn().mockResolvedValue([]),
    getTrainingMetrics: jest.fn().mockResolvedValue([]),
    getAiDataMetrics: jest.fn().mockResolvedValue([]),
    ...overrides.repository,
  } as unknown as DashboardsRepository;
  const service = new DashboardsService(repository, new ScopeService(), () => NOW);
  return { service, repository };
}

describe('DashboardsService date-window resolution', () => {
  it('defaults to a trailing 30-day window ending "now" when from/to are omitted', async () => {
    const { service, repository } = makeService();
    await service.getWorkshopDashboard({}, actorWith(['dashboards.workshop']));
    const [, window] = (repository.getWorkshopMetrics as jest.Mock).mock.calls[0];
    expect(window.to.toISOString()).toBe(new Date(NOW).toISOString());
    expect(window.from.toISOString()).toBe(new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString());
  });

  it('uses the caller-supplied from/to verbatim when both are given', async () => {
    const { service, repository } = makeService();
    await service.getWorkshopDashboard(
      { from: '2026-01-01T00:00:00.000Z', to: '2026-02-01T00:00:00.000Z' },
      actorWith(['dashboards.workshop']),
    );
    const [, window] = (repository.getWorkshopMetrics as jest.Mock).mock.calls[0];
    expect(window.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(window.to.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('derives "from" as 30 days before an explicit "to" when only "to" is given', async () => {
    const { service, repository } = makeService();
    await service.getWorkshopDashboard({ to: '2026-03-01T00:00:00.000Z' }, actorWith(['dashboards.workshop']));
    const [, window] = (repository.getWorkshopMetrics as jest.Mock).mock.calls[0];
    expect(window.to.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(window.from.toISOString()).toBe('2026-01-30T00:00:00.000Z');
  });
});

describe('DashboardsService scope resolution', () => {
  it('passes every allowed scope through when no organizationScopeId filter is given', async () => {
    const { service, repository } = makeService();
    await service.getWorkshopDashboard({}, actorWith(['dashboards.workshop']));
    const [scopeIds] = (repository.getWorkshopMetrics as jest.Mock).mock.calls[0];
    expect(scopeIds).toEqual([scopeId]);
  });

  it('narrows to the requested scope when it is allowed', async () => {
    const { service, repository } = makeService();
    await service.getWorkshopDashboard({ organizationScopeId: scopeId }, actorWith(['dashboards.workshop']));
    const [scopeIds] = (repository.getWorkshopMetrics as jest.Mock).mock.calls[0];
    expect(scopeIds).toEqual([scopeId]);
  });

  it('resolves to an empty scope set (not an error) when the requested scope is not one the caller holds', async () => {
    const { service, repository } = makeService();
    const response = await service.getWorkshopDashboard(
      { organizationScopeId: otherScopeId },
      actorWith(['dashboards.workshop']),
    );
    const [scopeIds] = (repository.getWorkshopMetrics as jest.Mock).mock.calls[0];
    expect(scopeIds).toEqual([]);
    expect(response.metrics).toEqual([]);
  });
});

describe('DashboardsService permission-gated (cost/finance-sensitive) metrics', () => {
  const rawMetrics: RawMetric[] = [
    { key: 'STOCK_ACCURACY', unit: 'PERCENT', value: '99.00', recordCount: 10, requiresPermission: 'inventory.read' },
    { key: 'INVENTORY_TURNOVER', unit: 'RATIO', value: '1.5', recordCount: 5, requiresPermission: 'inventory.cost.read' },
    { key: 'INVOICE_VARIANCE', unit: 'MONEY', value: '100.0000', recordCount: 2, requiresPermission: 'invoices.read' },
  ];

  it('includes every metric when the actor holds all of the required permissions', async () => {
    const { service } = makeService({ repository: { getInventoryFinanceMetrics: jest.fn().mockResolvedValue(rawMetrics) } });
    const response = await service.getInventoryFinanceDashboard(
      {},
      actorWith(['dashboards.inventory-finance', 'inventory.read', 'inventory.cost.read', 'invoices.read']),
    );
    expect(response.metrics.map((m) => m.key)).toEqual(['STOCK_ACCURACY', 'INVENTORY_TURNOVER', 'INVOICE_VARIANCE']);
  });

  it('conceals cost-sensitive and invoice-sensitive metrics from a caller lacking those permissions (e.g. STOREKEEPER_PROCUREMENT lacks invoices.read)', async () => {
    const { service } = makeService({ repository: { getInventoryFinanceMetrics: jest.fn().mockResolvedValue(rawMetrics) } });
    const response = await service.getInventoryFinanceDashboard(
      {},
      actorWith(['dashboards.inventory-finance', 'inventory.read']),
    );
    expect(response.metrics.map((m) => m.key)).toEqual(['STOCK_ACCURACY']);
  });

  it('never returns a concealed metric even with a value present in the raw repository row', async () => {
    const { service } = makeService({ repository: { getInventoryFinanceMetrics: jest.fn().mockResolvedValue(rawMetrics) } });
    const response = await service.getInventoryFinanceDashboard({}, actorWith(['dashboards.inventory-finance']));
    expect(response.metrics).toEqual([]);
  });
});

describe('DashboardsService filterFingerprint', () => {
  it('matches computeFilterFingerprint(filters, resolvedScopeIds) exactly', async () => {
    const { service } = makeService();
    const filters = { storeId: 'store-1' };
    const response = await service.getWorkshopDashboard(filters, actorWith(['dashboards.workshop']));
    expect(response.filterFingerprint).toBe(computeFilterFingerprint(filters, [scopeId]));
  });

  it('is a 64-character hex string', async () => {
    const { service } = makeService();
    const response = await service.getWorkshopDashboard({}, actorWith(['dashboards.workshop']));
    expect(response.filterFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('DashboardsService ai-data reorder/risk gating', () => {
  it('passes the caller\'s reorder/risk read permissions through to the repository', async () => {
    const { service, repository } = makeService();
    await service.getAiDataDashboard({}, actorWith(['dashboards.ai-data', 'predictions.reorder.read']));
    const call = (repository.getAiDataMetrics as jest.Mock).mock.calls[0];
    expect(call[0]).toEqual([scopeId]);
    expect(call[3]).toBe(true);
    expect(call[4]).toBe(false);
  });
});

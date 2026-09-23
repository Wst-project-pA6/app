import { DatabaseService } from '../../common/database/database.service';
import { DashboardsRepository } from './dashboards.repository';

const scopeIds = ['scope-1'];
const window = { from: new Date('2026-01-01T00:00:00.000Z'), to: new Date('2026-02-01T00:00:00.000Z') };

function makeRepository(rows: unknown[] = [], singleRow: unknown = null) {
  const db = {
    query: jest.fn().mockResolvedValue({ rows }),
    queryOne: jest.fn().mockResolvedValue(singleRow),
    queryValue: jest.fn().mockResolvedValue(0),
  };
  return { repository: new DashboardsRepository(db as unknown as DatabaseService), db };
}

describe('DashboardsRepository — scope and date boundary parameters', () => {
  it('jobsByStage scopes by organization_scope_id and filters created_at to [from, to)', async () => {
    const { repository, db } = makeRepository([{ stage: 'RECEIVED', cnt: 3 }]);
    const metric = await repository.getWorkshopMetrics(scopeIds, window, {});
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('j.organization_scope_id = ANY($1::uuid[])');
    expect(sql).toContain('j.created_at >= $2::timestamptz AND j.created_at < $3::timestamptz');
    expect(params).toEqual([scopeIds, window.from.toISOString(), window.to.toISOString()]);
    expect(metric[0]).toMatchObject({ key: 'JOBS_BY_STAGE', value: '3', recordCount: 3 });
  });

  it('jobsByStage adds bay/technician filters only when provided, appending new parameters', async () => {
    const { repository, db } = makeRepository([]);
    await repository.getWorkshopMetrics(scopeIds, window, { bayId: 'bay-1', technicianId: 'tech-1' });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('j.bay_id = $4');
    expect(sql).toContain('j.technician_id = $5');
    expect(params).toEqual([scopeIds, window.from.toISOString(), window.to.toISOString(), 'bay-1', 'tech-1']);
  });
});

describe('DashboardsRepository — inventory-finance cost/permission-tagged metrics', () => {
  it('tags STOCK_ACCURACY with requiresPermission inventory.read and scopes+filters by store', async () => {
    const { repository, db } = makeRepository([], { total: 10, accuracy: '95.00' });
    const metrics = await repository.getInventoryFinanceMetrics(scopeIds, window, { storeId: 'store-1' });
    const accuracy = metrics.find((m) => m.key === 'STOCK_ACCURACY')!;
    expect(accuracy).toMatchObject({ requiresPermission: 'inventory.read', value: '95.00', recordCount: 10 });
    const accuracyCall = db.queryOne.mock.calls.find(([sql]: [string]) => sql.includes('ledger'))!;
    expect(accuracyCall[0]).toContain('s.id = $2');
    expect(accuracyCall[1]).toEqual([scopeIds, 'store-1']);
  });

  it('tags INVENTORY_TURNOVER with requiresPermission inventory.cost.read', async () => {
    const { repository } = makeRepository([], { cnt: 1, turnover: '2.0000' });
    const metrics = await repository.getInventoryFinanceMetrics(scopeIds, window, {});
    expect(metrics.find((m) => m.key === 'INVENTORY_TURNOVER')).toMatchObject({ requiresPermission: 'inventory.cost.read' });
  });

  it('tags INVOICE_VARIANCE and AGING_REFERENCES with requiresPermission invoices.read and filters issued_at to [from, to)', async () => {
    const { repository, db } = makeRepository([], { cnt: 2, variance: '-50.0000', currency_code: 'EGP' });
    const metrics = await repository.getInventoryFinanceMetrics(scopeIds, window, {});
    const variance = metrics.find((m) => m.key === 'INVOICE_VARIANCE')!;
    expect(variance).toMatchObject({ requiresPermission: 'invoices.read', value: '-50.0000', currencyCode: 'EGP' });
    const varianceCall = db.queryOne.mock.calls.find(([sql]: [string]) => sql.includes('approved_est'))!;
    expect(varianceCall[0]).toContain('i.issued_at >= $2::timestamptz AND i.issued_at < $3::timestamptz');

    const aging = metrics.find((m) => m.key === 'AGING_REFERENCES')!;
    expect(aging.requiresPermission).toBe('invoices.read');
  });
});

describe('DashboardsRepository — ai-data permission gating happens before any query runs', () => {
  it('runs no reorder query when canReadReorder is false, and no risk query when canReadRisk is false', async () => {
    const { repository, db } = makeRepository([], { evaluated: 0, rate: '0' });
    await repository.getAiDataMetrics(scopeIds, window, {}, false, false);
    expect(db.queryOne).not.toHaveBeenCalled();
    expect(db.queryValue).not.toHaveBeenCalled();
  });

  it('includes MISSING_DATA_COUNT and LATE_DATA_COUNT once at least one of reorder/risk is readable', async () => {
    const { repository } = makeRepository([], { total: 0, acceptance_rate: '0', override_rate: '0' });
    const metrics = await repository.getAiDataMetrics(scopeIds, window, {}, true, false);
    expect(metrics.map((m) => m.key)).toEqual(
      expect.arrayContaining(['REORDER_ACCEPTANCE_RATE', 'REORDER_OVERRIDE_RATE', 'MISSING_DATA_COUNT', 'LATE_DATA_COUNT']),
    );
  });
});

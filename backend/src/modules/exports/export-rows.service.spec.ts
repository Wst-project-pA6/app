import { DatabaseService } from '../../common/database/database.service';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { DashboardsService } from '../dashboards/dashboards.service';
import { ExportRowsService } from './export-rows.service';
import { ExportType } from './dto/export.dto';

const scopeIds = ['scope-1'];
const window = { from: new Date('2026-01-01T00:00:00.000Z'), to: new Date('2026-02-01T00:00:00.000Z') };

const actorWithCost: AuthenticatedPrincipal = {
  id: 'user-1', email: 'u@example.test', displayName: 'U', preferredLocale: 'en',
  roles: ['STOREKEEPER_PROCUREMENT'], permissions: ['inventory.read', 'inventory.cost.read'],
  organizationScopeIds: scopeIds, mustChangePassword: false,
};
const actorWithoutCost: AuthenticatedPrincipal = { ...actorWithCost, permissions: ['inventory.read'] };

function makeRowsService(rows: Record<string, unknown>[] = [], totalRow: Record<string, unknown> | null = null) {
  const db = {
    query: jest.fn().mockResolvedValue({ rows }),
    queryOne: jest.fn().mockResolvedValue(totalRow),
  };
  const dashboards = {} as unknown as DashboardsService;
  return { service: new ExportRowsService(db as unknown as DatabaseService, dashboards), db };
}

describe('ExportRowsService — scope and date boundary parameters', () => {
  it('JOBS filters job_cards by scope and created_at in [from, to)', async () => {
    const { service, db } = makeRowsService([{ job_number: 'JC-2026-1', stage: 'RECEIVED' }]);
    const result = await service.build(ExportType.JOBS, scopeIds, window, {}, actorWithCost, undefined);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('j.organization_scope_id = ANY($1::uuid[])');
    expect(sql).toContain('j.created_at >= $2::timestamptz AND j.created_at < $3::timestamptz');
    expect(params).toEqual([scopeIds, window.from.toISOString(), window.to.toISOString()]);
    expect(result.rowCount).toBe(1);
    expect(result.totals).toEqual([{ key: 'ROW_COUNT', label: 'Row count', unit: 'COUNT', value: '1', recordCount: 1 }]);
  });
});

describe('ExportRowsService — cost concealment (inventory.cost.read)', () => {
  it('includes unitCost column and header for PART_ISSUES only when the actor holds inventory.cost.read', async () => {
    const { service } = makeRowsService(
      [{ job_id: 'j1', part_sku: 'SKU1', store_id: 's1', quantity: 2, reversed_quantity: 0,
         unit_price_amount: '10.0000', unit_price_currency: 'EGP', unit_cost_amount: '6.0000',
         unit_cost_currency: 'EGP', line_total_amount: '20.0000', status: 'ISSUED', created_at: new Date() }],
      { total: '20.0000', currency: 'EGP' },
    );
    const withCost = await service.build(ExportType.PART_ISSUES, scopeIds, window, {}, actorWithCost, undefined);
    expect(withCost.headers).toContain('unitCost');

    const withoutCost = await service.build(ExportType.PART_ISSUES, scopeIds, window, {}, actorWithoutCost, undefined);
    expect(withoutCost.headers).not.toContain('unitCost');
  });

  it('omits the TOTAL_AMOUNT metric for STOCK_BALANCES when the actor lacks inventory.cost.read', async () => {
    const { service } = makeRowsService([{ store_id: 's1', part_id: 'p1', on_hand: 5, reserved: 0, min_level: 0, max_level: 10 }]);
    const result = await service.build(ExportType.STOCK_BALANCES, scopeIds, window, {}, actorWithoutCost, undefined);
    expect(result.totals.map((t) => t.key)).toEqual(['ROW_COUNT']);
  });

  it('includes the TOTAL_AMOUNT metric for STOCK_BALANCES when the actor holds inventory.cost.read', async () => {
    const { service } = makeRowsService(
      [{ store_id: 's1', part_id: 'p1', on_hand: 5, reserved: 0, min_level: 0, max_level: 10, average_cost_amount: '3.0000' }],
      { total: '15.0000', currency: 'EGP' },
    );
    const result = await service.build(ExportType.STOCK_BALANCES, scopeIds, window, {}, actorWithCost, undefined);
    expect(result.totals.map((t) => t.key)).toEqual(['ROW_COUNT', 'TOTAL_AMOUNT']);
  });
});

describe('ExportRowsService — DASHBOARD_* delegates to DashboardsService', () => {
  it('flattens dashboard metrics (and their breakdowns) into rows, and reuses them as totals', async () => {
    const dashboards = {
      getWorkshopDashboard: jest.fn().mockResolvedValue({
        metrics: [
          { key: 'JOBS_BY_STAGE', label: 'Jobs by stage', unit: 'COUNT', value: '2', recordCount: 2,
            breakdown: [{ key: 'RECEIVED', label: 'RECEIVED', value: '2', recordCount: 2 }] },
        ],
      }),
    } as unknown as DashboardsService;
    const db = { query: jest.fn(), queryOne: jest.fn() };
    const service = new ExportRowsService(db as unknown as DatabaseService, dashboards);
    const result = await service.build(ExportType.DASHBOARD_WORKSHOP, scopeIds, window, {}, actorWithCost, undefined);
    expect(result.rows).toEqual([
      ['JOBS_BY_STAGE', 'Jobs by stage', 'COUNT', '2', '', '2'],
      ['JOBS_BY_STAGE.RECEIVED', 'RECEIVED', 'COUNT', '2', '', '2'],
    ]);
    expect(result.totals).toEqual([{ key: 'JOBS_BY_STAGE', label: 'Jobs by stage', unit: 'COUNT', value: '2', currencyCode: undefined, recordCount: 2 }]);
    expect(db.query).not.toHaveBeenCalled();
  });
});

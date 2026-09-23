import { DatabaseService } from '../../common/database/database.service';
import { ExportsRepository, packFiltersColumn, unpackFiltersColumn } from './exports.repository';

describe('packFiltersColumn / unpackFiltersColumn', () => {
  it('round-trips request filters with no totals yet (a freshly created PENDING job)', () => {
    const json = packFiltersColumn({ storeId: 'store-1' });
    const unpacked = unpackFiltersColumn(JSON.parse(json));
    expect(unpacked).toEqual({ requestFilters: { storeId: 'store-1' }, totals: undefined });
  });

  it('round-trips request filters together with totals (a COMPLETED job)', () => {
    const totals = [{ key: 'ROW_COUNT', label: 'Row count', unit: 'COUNT', value: '5', recordCount: 5 }];
    const json = packFiltersColumn({ storeId: 'store-1' }, totals);
    const unpacked = unpackFiltersColumn(JSON.parse(json));
    expect(unpacked).toEqual({ requestFilters: { storeId: 'store-1' }, totals });
  });

  it('defaults requestFilters to {} when the stored value has none', () => {
    expect(unpackFiltersColumn({})).toEqual({ requestFilters: {}, totals: undefined });
  });
});

describe('ExportsRepository.list', () => {
  it('always scopes by requested_by, and rejects a sort field other than createdAt', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }), queryValue: jest.fn().mockResolvedValue(0) };
    const repository = new ExportsRepository(db as unknown as DatabaseService);
    await expect(repository.list('user-1', { page: 1, pageSize: 20, sort: 'status' })).rejects.toThrow('INVALID_SORT');
  });

  it('defaults to -createdAt (newest first) when sort is omitted, matching the contract default', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }), queryValue: jest.fn().mockResolvedValue(0) };
    const repository = new ExportsRepository(db as unknown as DatabaseService);
    await repository.list('user-1', { page: 1, pageSize: 20 });
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY created_at DESC, id ASC');
  });

  it('sorts ascending only when the caller explicitly passes "createdAt" (no leading "-")', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }), queryValue: jest.fn().mockResolvedValue(0) };
    const repository = new ExportsRepository(db as unknown as DatabaseService);
    await repository.list('user-1', { page: 1, pageSize: 20, sort: 'createdAt' });
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY created_at ASC, id ASC');
  });

  it('adds status/exportType filters only when provided', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }), queryValue: jest.fn().mockResolvedValue(0) };
    const repository = new ExportsRepository(db as unknown as DatabaseService);
    await repository.list('user-1', { page: 1, pageSize: 20, status: 'COMPLETED', exportType: 'JOBS' });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('requested_by = $1');
    expect(sql).toContain('status = $2');
    expect(sql).toContain('export_type = $3');
    expect(params.slice(0, 3)).toEqual(['user-1', 'COMPLETED', 'JOBS']);
  });
});

describe('ExportsRepository.insert', () => {
  it('inserts a PENDING row with the given filters JSON and fingerprint', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'job-1' }] }) };
    const repository = new ExportsRepository({} as DatabaseService);
    await repository.insert(client as never, {
      requestedBy: 'user-1', exportType: 'JOBS', format: 'CSV',
      filtersJson: '{"requestFilters":{}}', filterFingerprint: 'f'.repeat(64), sensitive: false,
    });
    expect(client.query.mock.calls[0][0]).toContain("VALUES ($1, $2, $3, 'PENDING', $4::jsonb, $5, $6, $7)");
    expect(client.query.mock.calls[0][1]).toEqual(['user-1', 'JOBS', 'CSV', '{"requestFilters":{}}', 'f'.repeat(64), false, null]);
  });
});

describe('ExportsRepository.customerAccessible', () => {
  it('checks scope via organization_scope_id = ANY(...)', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 1 }) };
    const repository = new ExportsRepository(db as unknown as DatabaseService);
    await expect(repository.customerAccessible('cust-1', ['scope-1'])).resolves.toBe(true);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('organization_scope_id = ANY($2::uuid[])'), ['cust-1', ['scope-1']]);
  });
});

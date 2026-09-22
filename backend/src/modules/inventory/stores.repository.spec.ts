import { DatabaseService } from '../../common/database/database.service';
import { orderStoresBy, StoreRow, StoresRepository } from './stores.repository';
import { StoreStatus } from './dto/store.dto';

describe('StoresRepository', () => {
  it('builds allowlisted deterministic order clauses and rejects unallowlisted sorts', () => {
    expect(orderStoresBy()).toBe('s.code ASC');
    expect(orderStoresBy('name')).toBe('s.name ASC');
    expect(orderStoresBy('-name,code')).toBe('s.name DESC, s.code ASC');
    expect(() => orderStoresBy('status')).toThrow('INVALID_SORT');
    expect(() => orderStoresBy('code,-invalid')).toThrow('INVALID_SORT');
  });

  it('uses parameterized filters and allowlisted deterministic sorting in list', async () => {
    const queryValue = jest.fn().mockResolvedValue(1);
    const mockRow: StoreRow = {
      id: '11111111-1111-4111-8111-111111111111',
      organization_scope_id: '22222222-2222-4222-8222-222222222222',
      code: 'STORE-1',
      name: 'Primary Store',
      status: StoreStatus.ACTIVE,
      created_at: new Date(),
      updated_at: new Date(),
      created_by: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      updated_by: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    };
    const query = jest.fn().mockResolvedValue({ rows: [mockRow] });
    const repository = new StoresRepository({ queryValue, query } as unknown as DatabaseService);

    const result = await repository.list(
      { page: 2, pageSize: 10, status: StoreStatus.ACTIVE, sort: '-name' },
      ['22222222-2222-4222-8222-222222222222'],
    );

    expect(result.totalItems).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(queryValue).toHaveBeenCalledWith(
      expect.stringContaining('s.status = $2'),
      [['22222222-2222-4222-8222-222222222222'], StoreStatus.ACTIVE],
    );
    expect(query.mock.calls[0][0]).toContain('ORDER BY s.name DESC, s.id ASC');
    expect(query.mock.calls[0][0]).toContain('LIMIT $3 OFFSET $4');
    expect(query.mock.calls[0][1]).toEqual([
      ['22222222-2222-4222-8222-222222222222'],
      StoreStatus.ACTIVE,
      10,
      10,
    ]);
  });

  it('checks active scopes with row share lock', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ id: 'scope-1' }] });
    const client = { query: clientQuery };
    const repository = new StoresRepository({} as DatabaseService);

    const isActive = await repository.findActiveScope(client as never, 'scope-1');
    expect(isActive).toBe(true);
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining("status = 'ACTIVE' FOR SHARE"),
      ['scope-1'],
    );
  });

  it('queries scoped store with FOR UPDATE when lock is requested', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [] });
    const client = { query: clientQuery };
    const repository = new StoresRepository({} as DatabaseService);

    await repository.findScoped('store-1', ['scope-1'], client as never, true);
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE OF s'),
      ['store-1', ['scope-1']],
    );
  });

  it('checks on-hand or reserved stock existence', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [{ hasStock: true }] });
    const client = { query: clientQuery };
    const repository = new StoresRepository({} as DatabaseService);

    const hasStock = await repository.hasOnHandOrReservedStock(client as never, 'store-1');
    expect(hasStock).toBe(true);
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('on_hand > 0 OR reserved > 0'),
      ['store-1'],
    );
  });
});

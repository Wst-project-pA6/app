import { DatabaseService } from '../../common/database/database.service';
import { orderPartsBy, PartsRepository, PartRow } from './parts.repository';
import { PartStatus } from './dto/part.dto';

describe('PartsRepository', () => {
  it('builds allowlisted deterministic order clauses and rejects unallowlisted sort fields', () => {
    expect(orderPartsBy()).toBe('p.sku ASC');
    expect(orderPartsBy('name')).toBe('p.name_en ASC');
    expect(orderPartsBy('category')).toBe('p.category ASC');
    expect(orderPartsBy('createdAt')).toBe('p.created_at ASC');
    expect(orderPartsBy('-createdAt,sku')).toBe('p.created_at DESC, p.sku ASC');
    expect(() => orderPartsBy('price')).toThrow('INVALID_SORT');
    expect(() => orderPartsBy('status')).toThrow('INVALID_SORT');
  });

  it('uses parameterized filters, sorting, and pagination in list', async () => {
    const queryValue = jest.fn().mockResolvedValue(1);
    const mockRow: PartRow = {
      id: 'part-1',
      sku: 'FLTR-001',
      barcode: '12345678',
      name_en: 'Oil Filter',
      name_ar: null,
      category: 'Filters',
      unit_of_measure: 'EA',
      selling_price_amount: '20.0000',
      selling_price_currency: 'USD',
      status: PartStatus.ACTIVE,
      version: 1,
      created_at: new Date(),
      updated_at: new Date(),
      created_by: 'user-1',
      updated_by: 'user-1',
    };
    const query = jest.fn().mockResolvedValue({ rows: [mockRow] });
    const repository = new PartsRepository({ queryValue, query } as unknown as DatabaseService);

    const result = await repository.list({
      page: 1,
      pageSize: 10,
      q: 'filter',
      sku: 'FLTR-001',
      barcode: '12345678',
      category: 'Filters',
      status: PartStatus.ACTIVE,
      compatibleMake: 'Toyota',
      compatibleModel: 'Corolla',
      sort: '-name',
    });

    expect(result.totalItems).toBe(1);
    expect(result.rows).toHaveLength(1);

    expect(queryValue).toHaveBeenCalledWith(
      expect.stringContaining('p.sku ILIKE $1'),
      ['%filter%', 'FLTR-001', '12345678', 'Filters', PartStatus.ACTIVE, 'Toyota', 'Corolla'],
    );
    expect(query.mock.calls[0][0]).toContain('ORDER BY p.name_en DESC, p.id ASC');
    expect(query.mock.calls[0][0]).toContain('LIMIT $8 OFFSET $9');
    expect(query.mock.calls[0][1]).toEqual([
      '%filter%',
      'FLTR-001',
      '12345678',
      'Filters',
      PartStatus.ACTIVE,
      'Toyota',
      'Corolla',
      10,
      0,
    ]);
  });

  it('locks part row on findById when requested', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [] });
    const client = { query: clientQuery };
    const repository = new PartsRepository({} as DatabaseService);

    await repository.findById(client as never, 'part-1', true);
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE OF p'),
      ['part-1'],
    );
  });

  it('groups compatibilities by part id', async () => {
    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [
          { id: 'c1', part_id: 'p1', make: 'Toyota', model: 'Corolla', year_from: 2018, year_to: 2022 },
          { id: 'c2', part_id: 'p1', make: 'Honda', model: 'Civic', year_from: 2019, year_to: null },
          { id: 'c3', part_id: 'p2', make: 'Ford', model: 'Focus', year_from: null, year_to: null },
        ],
      }),
    };
    const repository = new PartsRepository(db as never);

    const grouped = await repository.findCompatibilitiesByPartIds(undefined, ['p1', 'p2']);
    expect(grouped['p1']).toHaveLength(2);
    expect(grouped['p2']).toHaveLength(1);
  });

  it('checks on-hand stock and open purchase orders', async () => {
    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ hasOnHand: true }] })
      .mockResolvedValueOnce({ rows: [{ hasOpenPo: true }] });
    const client = { query: clientQuery };
    const repository = new PartsRepository({} as DatabaseService);

    const hasOnHand = await repository.hasOnHandStock(client as never, 'p1');
    const hasOpenPo = await repository.hasOpenPurchaseOrder(client as never, 'p1');

    expect(hasOnHand).toBe(true);
    expect(hasOpenPo).toBe(true);
    expect(clientQuery.mock.calls[0][0]).toContain('on_hand > 0');
    expect(clientQuery.mock.calls[1][0]).toContain("po.status NOT IN ('RECEIVED', 'CANCELLED', 'REJECTED')");
  });

  it('executes atomic optimistic update with expected version', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [{ id: 'p1', version: 2 }] });
    const client = { query: clientQuery };
    const repository = new PartsRepository({} as DatabaseService);

    const result = await repository.update(
      client as never,
      'p1',
      1,
      { category: 'Brakes' },
      'user-1',
    );

    expect(result).toMatchObject({ id: 'p1', version: 2 });
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('version = version + 1'),
      ['Brakes', 'user-1', 'p1', 1],
    );
  });
});

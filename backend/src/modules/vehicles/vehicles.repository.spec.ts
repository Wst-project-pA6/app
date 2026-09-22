import { DatabaseService } from '../../common/database/database.service';
import { VehiclesRepository } from './vehicles.repository';

const scopeId = '22222222-2222-4222-8222-222222222222';
const vehicleId = '11111111-1111-4111-8111-111111111111';

describe('VehiclesRepository', () => {
  it('uses scoped, parameterized vehicle filters and deterministic allowlisted sorting', async () => {
    const queryValue = jest.fn().mockResolvedValue(2);
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new VehiclesRepository({ queryValue, query } as unknown as DatabaseService);

    await repository.list(
      {
        page: 2,
        pageSize: 20,
        sort: '-make,plate',
        q: 'honda',
        customerId: '33333333-3333-4333-8333-333333333333',
        plate: 'ABC123',
        vin: '1HGCM82633A004352',
        make: 'Honda',
        model: 'Accord',
        status: 'ACTIVE',
      },
      [scopeId],
    );

    expect(queryValue).toHaveBeenCalledWith(expect.stringContaining('count(*)'), [
      [scopeId],
      '%honda%',
      '%honda%',
      '%honda%',
      '%honda%',
      '33333333-3333-4333-8333-333333333333',
      'ABC123',
      '1HGCM82633A004352',
      'Honda',
      'Accord',
      'ACTIVE',
    ]);
    const pageCall = query.mock.calls[0];
    expect(pageCall[0]).toContain('c.organization_scope_id = ANY($1::uuid[])');
    expect(pageCall[0]).toContain('ORDER BY v.make DESC, v.plate ASC, v.id ASC');
    expect(pageCall[0]).toContain('LIMIT $12 OFFSET $13');
    expect(pageCall[1]).toEqual([
      [scopeId],
      '%honda%',
      '%honda%',
      '%honda%',
      '%honda%',
      '33333333-3333-4333-8333-333333333333',
      'ABC123',
      '1HGCM82633A004352',
      'Honda',
      'Accord',
      'ACTIVE',
      20,
      20,
    ]);
    expect(pageCall[0]).not.toContain('honda');
  });

  it('keeps vehicle reads scoped through customers and parameterized', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new VehiclesRepository({ query } as unknown as DatabaseService);

    await repository.findScoped(vehicleId, [scopeId]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('JOIN customers c ON c.id = v.customer_id'),
      [vehicleId, [scopeId]],
    );
    expect(query.mock.calls[0][0]).toContain("os.status = 'ACTIVE'");
  });

  it('filters service history to delivered jobs and orders by latest delivery', async () => {
    const queryValue = jest.fn().mockResolvedValue(1);
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new VehiclesRepository({ queryValue, query } as unknown as DatabaseService);

    await repository.listHistory(vehicleId, { page: 1, pageSize: 20 });
    expect(queryValue).toHaveBeenCalledWith(expect.stringContaining("j.stage = 'DELIVERED'"), [vehicleId]);
    expect(query.mock.calls[0][0]).toContain('ORDER BY j.delivered_at DESC, j.id DESC');
    expect(query.mock.calls[0][1]).toEqual([vehicleId, 20, 0]);
  });

  it('selects the next open reminder using date/mileage ordering', async () => {
    const queryOne = jest.fn().mockResolvedValue(null);
    const repository = new VehiclesRepository({ queryOne } as unknown as DatabaseService);

    await repository.findNextService(vehicleId);
    expect(queryOne).toHaveBeenCalledWith(
      expect.stringContaining("r.status = 'OPEN'"),
      [vehicleId],
    );
    expect(queryOne.mock.calls[0][0]).toContain('ORDER BY r.due_date NULLS LAST, r.due_mileage NULLS LAST, r.id ASC');
  });

  it('rejects an unknown sort field before database calls', async () => {
    const repository = new VehiclesRepository({
      queryValue: jest.fn(),
      query: jest.fn(),
    } as unknown as DatabaseService);
    await expect(repository.list({ page: 1, pageSize: 20, sort: 'vinNumber' }, [])).rejects.toThrow('INVALID_SORT');
  });
});

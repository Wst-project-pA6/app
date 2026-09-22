import { DatabaseService } from '../../common/database/database.service';
import { CustomersRepository } from './customers.repository';

describe('CustomersRepository', () => {
  it('uses scoped, parameterized count and page queries with deterministic sorting', async () => {
    const queryValue = jest.fn().mockResolvedValue(3);
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new CustomersRepository({ queryValue, query } as unknown as DatabaseService);

    await repository.list(
      {
        page: 2,
        pageSize: 20,
        sort: '-createdAt,displayName',
        q: 'alice',
        status: 'ACTIVE',
        phone: '+201001234567',
      },
      ['22222222-2222-4222-8222-222222222222'],
    );

    expect(queryValue).toHaveBeenCalledWith(expect.stringContaining('count(*)'), [
      ['22222222-2222-4222-8222-222222222222'],
      '%alice%',
      '%alice%',
      '%alice%',
      'ACTIVE',
      '+201001234567',
    ]);
    const pageCall = query.mock.calls[0];
    expect(pageCall[0]).toContain('c.organization_scope_id = ANY($1::uuid[])');
    expect(pageCall[0]).toContain('ORDER BY c.created_at DESC, c.display_name ASC, c.id ASC');
    expect(pageCall[0]).toContain('LIMIT $7 OFFSET $8');
    expect(pageCall[1]).toEqual([
      ['22222222-2222-4222-8222-222222222222'],
      '%alice%',
      '%alice%',
      '%alice%',
      'ACTIVE',
      '+201001234567',
      20,
      20,
    ]);
    expect(pageCall[0]).not.toContain('alice');
  });

  it('keeps path lookups scoped and supports row locking for updates', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new CustomersRepository({ query } as unknown as DatabaseService);
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) } as never;

    await repository.findScoped(
      '11111111-1111-4111-8111-111111111111',
      ['22222222-2222-4222-8222-222222222222'],
      client,
      true,
    );

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      [
        '11111111-1111-4111-8111-111111111111',
        ['22222222-2222-4222-8222-222222222222'],
      ],
    );
  });

  it('rejects a sort field that is outside the customer allowlist', async () => {
    const repository = new CustomersRepository({
      queryValue: jest.fn(),
      query: jest.fn(),
    } as unknown as DatabaseService);
    await expect(repository.list({ page: 1, pageSize: 20, sort: 'email' }, [])).rejects.toThrow('INVALID_SORT');
  });
});

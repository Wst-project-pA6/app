import { AccessRepository } from './access.repository';
import { DatabaseService } from '../../common/database/database.service';

describe('AccessRepository', () => {
  it('uses separate parameterized count and page queries for user filters', async () => {
    const queryValue = jest.fn().mockResolvedValue(3);
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new AccessRepository({ queryValue, query } as unknown as DatabaseService);
    await repository.listUsers({
      page: 2, pageSize: 20, q: 'alice', role: 'TECHNICIAN', status: 'ACTIVE',
      organizationScopeId: '22222222-2222-4222-8222-222222222222', sort: '-email',
    });
    expect(queryValue).toHaveBeenCalledWith(expect.stringContaining('count(*)'), [
      '%alice%', '%alice%', 'TECHNICIAN', 'ACTIVE', '22222222-2222-4222-8222-222222222222',
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY u.email DESC'),
      ['%alice%', '%alice%', 'TECHNICIAN', 'ACTIVE', '22222222-2222-4222-8222-222222222222', 20, 20],
    );
  });

  it('locks administrators and scopes deterministically', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [{ id: 'a' }] });
    const client = { query: clientQuery } as never;
    const repository = new AccessRepository({} as DatabaseService);
    await repository.lockActiveSystemAdmins(client);
    await repository.lockActiveScopes(client, ['22222222-2222-4222-8222-222222222222']);
    expect(clientQuery.mock.calls[0][0]).toContain('ORDER BY u.id FOR UPDATE');
    expect(clientQuery.mock.calls[1][0]).toContain('ORDER BY id FOR UPDATE');
  });

  it('replaces grants with one parameterized insert carrying granted_by', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [] });
    const client = { query: clientQuery } as never;
    const repository = new AccessRepository({} as DatabaseService);
    await repository.replaceRoles(client, '11111111-1111-4111-8111-111111111111', ['TECHNICIAN'], 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    await repository.replaceScopes(client, '11111111-1111-4111-8111-111111111111', ['22222222-2222-4222-8222-222222222222'], 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(clientQuery.mock.calls[1][0]).toContain('granted_by');
    expect(clientQuery.mock.calls[3][0]).toContain('granted_by');
    expect(clientQuery.mock.calls[1][1][2]).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(clientQuery.mock.calls[3][1][2]).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('loads role permissions from the database mapping', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ code: 'TECHNICIAN', permissions: ['jobs.read'] }] });
    const repository = new AccessRepository({ query } as unknown as DatabaseService);
    const result = await repository.roles();
    expect(result.rows).toEqual([{ code: 'TECHNICIAN', permissions: ['jobs.read'] }]);
    expect(query.mock.calls[0][0]).toContain('role_permissions');
  });
});

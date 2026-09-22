import { DatabaseService } from '../../common/database/database.service';
import { BaysRepository } from './bays.repository';

describe('BaysRepository', () => {
  it('uses parameterized filters and allowlisted deterministic sorting', async () => {
    const queryValue = jest.fn().mockResolvedValue(1);
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new BaysRepository({ queryValue, query } as unknown as DatabaseService);
    await repository.list({ page: 2, pageSize: 20, status: 'ACTIVE', sort: '-name' }, ['22222222-2222-4222-8222-222222222222']);
    expect(queryValue).toHaveBeenCalledWith(expect.stringContaining('b.status = $2'), [['22222222-2222-4222-8222-222222222222'], 'ACTIVE']);
    expect(query.mock.calls[0][0]).toContain('ORDER BY b.name DESC, b.id ASC');
    expect(query.mock.calls[0][0]).toContain('LIMIT $3 OFFSET $4');
    expect(query.mock.calls[0][1]).toEqual([['22222222-2222-4222-8222-222222222222'], 'ACTIVE', 20, 20]);
    await expect(repository.list({ page: 1, pageSize: 20, sort: 'status' }, [])).rejects.toThrow('INVALID_SORT');
  });
});

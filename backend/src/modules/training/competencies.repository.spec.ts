import { DatabaseService } from '../../common/database/database.service';
import { CompetenciesRepository } from './competencies.repository';

const competencyId = '11111111-1111-4111-8111-111111111111';
const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('CompetenciesRepository', () => {
  it('creates via id-only RETURNING and re-fetches the full row', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: competencyId }] })
        .mockResolvedValueOnce({ rows: [{ id: competencyId, name_en: 'Brakes' }] }),
    };
    const repository = new CompetenciesRepository({} as DatabaseService);
    await repository.create(client as never, { code: 'BRAKES', nameEn: 'Brakes', actor });
    expect(client.query.mock.calls[0][0]).toContain('RETURNING id');
    expect(client.query.mock.calls[1][1]).toEqual([competencyId]);
  });

  it('locks the row with FOR UPDATE only when requested', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new CompetenciesRepository({} as DatabaseService);
    await repository.findById(competencyId, client as never, true);
    expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE OF comp');
    await repository.findById(competencyId, client as never, false);
    expect(client.query.mock.calls[1][0]).not.toContain('FOR UPDATE');
  });

  it('uses parameterized list filters and a deterministic default sort with no raw filter text in SQL', async () => {
    const queryValue = jest.fn().mockResolvedValue(1);
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new CompetenciesRepository({ queryValue, query } as unknown as DatabaseService);
    await repository.list({ page: 2, pageSize: 20, status: 'ACTIVE' } as never);
    expect(query.mock.calls[0][0]).toContain('comp.code ASC');
    expect(query.mock.calls[0][1]).toEqual(['ACTIVE', 20, 20]);
    await expect(repository.list({ page: 1, pageSize: 20, sort: 'name' } as never)).rejects.toThrow('INVALID_SORT');
  });
});

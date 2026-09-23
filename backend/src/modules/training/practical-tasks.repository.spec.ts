import { DatabaseService } from '../../common/database/database.service';
import { PracticalTasksRepository } from './practical-tasks.repository';

const taskId = '11111111-1111-4111-8111-111111111111';
const competencyId = '22222222-2222-4222-8222-222222222222';
const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('PracticalTasksRepository', () => {
  it('locks the referenced competency with FOR SHARE so it cannot be deleted mid-transaction', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: competencyId }] }) };
    const repository = new PracticalTasksRepository({} as DatabaseService);
    await repository.findCompetency(client as never, competencyId);
    expect(client.query.mock.calls[0][0]).toContain('FOR SHARE');
    expect(client.query.mock.calls[0][1]).toEqual([competencyId]);
  });

  it('creates via id-only RETURNING and re-fetches the full row', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: taskId }] })
        .mockResolvedValueOnce({ rows: [{ id: taskId, title_en: 'Change oil' }] }),
    };
    const repository = new PracticalTasksRepository({} as DatabaseService);
    await repository.create(client as never, {
      code: 'TASK-1', titleEn: 'Change oil', competencyId, expectedMinutes: 30, actor,
    });
    expect(client.query.mock.calls[0][0]).toContain('RETURNING id');
    expect(client.query.mock.calls[1][1]).toEqual([taskId]);
  });

  it('uses parameterized list filters and a deterministic default sort with no raw filter text in SQL', async () => {
    const queryValue = jest.fn().mockResolvedValue(1);
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new PracticalTasksRepository({ queryValue, query } as unknown as DatabaseService);
    await repository.list({ page: 1, pageSize: 20, q: 'brake', competencyId, status: 'ACTIVE' } as never);
    expect(query.mock.calls[0][0]).toContain('p.code ASC');
    expect(query.mock.calls[0][0]).not.toContain('brake');
    expect(query.mock.calls[0][1]).toEqual(['%brake%', competencyId, 'ACTIVE', 20, 0]);
    await expect(repository.list({ page: 1, pageSize: 20, sort: 'status' } as never)).rejects.toThrow('INVALID_SORT');
  });
});

import { DatabaseService } from '../../common/database/database.service';
import { QualityRepository } from './quality.repository';

describe('QualityRepository', () => {
  it('creates an append-only quality check with parameterized values', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'q1' }] }) };
    const repository = new QualityRepository({} as DatabaseService);
    const id = await repository.create(client as never, { jobId: 'job1', result: 'FAILED', notes: 'Paint defect', actor: 'user1' });
    expect(id).toBe('q1');
    expect(client.query.mock.calls[0][0]).toContain('INSERT INTO quality_checks');
    expect(client.query.mock.calls[0][1]).toEqual(['job1', 'FAILED', 'Paint defect', 'user1']);
  });

  it('rejects evidence attachments that are not the caller\'s unlinked quality evidence', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'att1' }], rowCount: 1 }) };
    const repository = new QualityRepository({} as DatabaseService);
    await expect(repository.linkEvidenceAttachments(client as never, 'q1', ['att1', 'att2'], 'user1')).rejects.toThrow('ATTACHMENT_NOT_LINKABLE');
    expect(client.query.mock.calls[0][0]).toContain("purpose = 'QUALITY_EVIDENCE'");
  });

  it('rejects relinking an already-LINKED attachment and locks in sorted UUID order excluding stale unlinked rows', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    const repository = new QualityRepository({} as DatabaseService);
    const unsortedIds = ['b2', 'a1'];
    await expect(repository.linkEvidenceAttachments(client as never, 'q1', unsortedIds, 'user1')).rejects.toThrow('ATTACHMENT_NOT_LINKABLE');
    const [selectSql, selectParams] = client.query.mock.calls[0];
    expect(selectSql).toContain("status = 'UNLINKED'");
    expect(selectSql).toContain('ORDER BY id');
    expect(selectSql).toContain("created_at > now() - interval '24 hours'");
    expect(selectParams[0]).toEqual([...unsortedIds].sort());
  });

  it('lists quality checks with a validated sort field', async () => {
    const queryValue = jest.fn().mockResolvedValue(1);
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new QualityRepository({ queryValue, query } as unknown as DatabaseService);
    await repository.list('job1', { page: 1, pageSize: 20 });
    expect(query.mock.calls[0][0]).toContain('performed_at ASC');
    await expect(repository.list('job1', { page: 1, pageSize: 20, sort: 'result' })).rejects.toThrow('INVALID_SORT');
  });
});

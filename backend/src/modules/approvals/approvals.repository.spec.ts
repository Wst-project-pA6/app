import { DatabaseService } from '../../common/database/database.service';
import { ApprovalsRepository } from './approvals.repository';

describe('ApprovalsRepository', () => {
  it('validates that referenced work items belong to the job, requiring is_additional_work when asked', async () => {
    const repository = new ApprovalsRepository({} as DatabaseService);
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'w1', is_additional_work: true }], rowCount: 1 }) };
    await expect(repository.validateWorkItems(client as never, 'job1', ['w1'], true)).resolves.toBe(true);

    const notAdditional = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'w1', is_additional_work: false }], rowCount: 1 }) };
    await expect(repository.validateWorkItems(notAdditional as never, 'job1', ['w1'], true)).resolves.toBe(false);

    const missing = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    await expect(repository.validateWorkItems(missing as never, 'job1', ['w1'], false)).resolves.toBe(false);
  });

  it('creates a PENDING approval with parameterized values and links work items via unnest', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'a1' }] }) };
    const repository = new ApprovalsRepository({} as DatabaseService);
    const id = await repository.create(client as never, {
      jobId: 'job1', scope: 'ADDITIONAL_WORK', description: 'Replace brake pads', estimatedAmount: '150.0000', estimatedCurrency: 'USD', actor: 'user1',
    });
    expect(id).toBe('a1');
    expect(client.query.mock.calls[0][0]).toContain('INSERT INTO job_approvals');
    expect(client.query.mock.calls[0][1]).toEqual(['job1', 'ADDITIONAL_WORK', 'Replace brake pads', '150.0000', 'USD', 'user1']);

    await repository.linkWorkItems(client as never, 'a1', ['w1', 'w2']);
    expect(client.query.mock.calls[1][0]).toContain('unnest($2::uuid[])');
    expect(client.query.mock.calls[1][1]).toEqual(['a1', ['w1', 'w2']]);
  });

  it('locks the approval row deterministically before a decision', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'a1', status: 'PENDING' }] }) };
    const repository = new ApprovalsRepository({} as DatabaseService);
    await repository.findLocked(client as never, 'job1', 'a1');
    expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE OF a');
    expect(client.query.mock.calls[0][1]).toEqual(['a1', 'job1']);
  });

  it('rejects linking attachments that are not owned, unlinked evidence for this purpose', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'att1' }], rowCount: 1 }) };
    const repository = new ApprovalsRepository({} as DatabaseService);
    await expect(repository.linkEvidenceAttachments(client as never, 'a1', ['att1', 'att2'], 'user1')).rejects.toThrow('ATTACHMENT_NOT_LINKABLE');
    expect(client.query.mock.calls[0][0]).toContain("purpose = 'APPROVAL_EVIDENCE'");
  });

  it('rejects relinking an attachment that is already LINKED (only UNLINKED rows match), and locks in sorted UUID order excluding stale unlinked rows', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    const repository = new ApprovalsRepository({} as DatabaseService);
    const unsortedIds = ['b2', 'a1'];
    await expect(repository.linkEvidenceAttachments(client as never, 'approval1', unsortedIds, 'user1')).rejects.toThrow('ATTACHMENT_NOT_LINKABLE');
    const [selectSql, selectParams] = client.query.mock.calls[0];
    expect(selectSql).toContain("status = 'UNLINKED'");
    expect(selectSql).toContain('ORDER BY id');
    expect(selectSql).toContain("created_at > now() - interval '24 hours'");
    expect(selectParams[0]).toEqual([...unsortedIds].sort());
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('lists approvals with parameterized filters and validates the sort allowlist', async () => {
    const queryValue = jest.fn().mockResolvedValue(1);
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new ApprovalsRepository({ queryValue, query } as unknown as DatabaseService);
    await repository.list('job1', { page: 1, pageSize: 20, status: 'PENDING' as never, scope: 'SUBLET' as never });
    expect(query.mock.calls[0][1]).toEqual(['job1', 'PENDING', 'SUBLET', 20, 0]);
    await expect(repository.list('job1', { page: 1, pageSize: 20, sort: 'status' })).rejects.toThrow('INVALID_SORT');
  });
});

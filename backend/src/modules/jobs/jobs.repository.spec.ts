import { DatabaseService } from '../../common/database/database.service';
import { JobsRepository } from './jobs.repository';

describe('JobsRepository', () => {
  it('uses the authoritative database sequence and never accepts a job number', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111' }] })
      .mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111', job_number: 'JC-2026-000001' }] }) };
    const repository = new JobsRepository({} as DatabaseService);
    await repository.create(client as never, {
      vehicleId: '22222222-2222-4222-8222-222222222222', customerId: '33333333-3333-4333-8333-333333333333',
      organizationScopeId: '44444444-4444-4444-8444-444444444444', complaint: 'Brake noise',
      serviceType: 'REPAIR', priority: 'NORMAL', mileageAtIntake: 100,
      expectedCompletionAt: '2026-10-02T15:00:00Z', actor: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    expect(client.query.mock.calls[0][0]).toContain("nextval('job_number_seq')");
    expect(client.query.mock.calls[0][0]).toContain("'JC-' || to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY')");
    expect(client.query.mock.calls[0][1]).not.toContain('JC-2026-000001');
  });

  it('uses parameterized list filters, deterministic sorting and no raw filter text in SQL', async () => {
    const queryValue = jest.fn().mockResolvedValue(1);
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new JobsRepository({ queryValue, query } as unknown as DatabaseService);
    await repository.list({ page: 2, pageSize: 20, q: 'brake', sort: '-priority', stage: 'RECEIVED' }, ['22222222-2222-4222-8222-222222222222']);
    expect(query.mock.calls[0][0]).toContain('j.priority DESC, j.id ASC');
    expect(query.mock.calls[0][0]).toContain('LIMIT $4 OFFSET $5');
    expect(query.mock.calls[0][1]).toEqual([['22222222-2222-4222-8222-222222222222'], '%brake%', 'RECEIVED', 20, 20]);
    expect(query.mock.calls[0][0]).not.toContain('brake');
    await expect(repository.list({ page: 1, pageSize: 20, sort: 'stage' }, [])).rejects.toThrow('INVALID_SORT');
  });

  it('locks assignment resources in SQL and queries all shared scheduling conflicts', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new JobsRepository({} as DatabaseService);
    await repository.findAccessibleBay('11111111-1111-4111-8111-111111111111', [], client as never, true);
    expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE');
    await repository.findAssignmentConflicts(client as never, '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2026-10-01T09:00:00Z', '2026-10-01T10:00:00Z');
    expect(client.query.mock.calls[1][0]).toContain('BAY_JOB_CONFLICT');
    expect(client.query.mock.calls[1][0]).toContain('BAY_SESSION_CONFLICT');
    expect(client.query.mock.calls[1][0]).toContain('MENTOR_SESSION_CONFLICT');
    expect(client.query.mock.calls[1][1]).toEqual([
      '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
      '2026-10-01T09:00:00Z', '2026-10-01T10:00:00Z', '33333333-3333-4333-8333-333333333333',
    ]);
  });

  it('links job attachments through the authoritative join table inside the caller transaction', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: '22222222-2222-4222-8222-222222222222' }, { id: '33333333-3333-4333-8333-333333333333' }], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 }) };
    const repository = new JobsRepository({} as DatabaseService);
    const ids = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
    await repository.linkAttachments(client as never, ids, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111');
    expect(client.query.mock.calls[0][1]).toEqual([ids, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
    expect(client.query.mock.calls[2][0]).toContain('INSERT INTO job_card_attachments');
    expect(client.query.mock.calls[2][1]).toEqual(['11111111-1111-4111-8111-111111111111', ids]);
  });

  it('locks attachment rows in deterministic (sorted) UUID order and excludes anything past the 24-hour unlinked window', async () => {
    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 })
      .mockResolvedValueOnce({ rows: [], rowCount: 2 }) };
    const repository = new JobsRepository({} as DatabaseService);
    const unsortedIds = ['33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222'];
    await repository.linkAttachments(client as never, unsortedIds, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111');
    const [selectSql, selectParams] = client.query.mock.calls[0];
    expect(selectSql).toContain('ORDER BY id');
    expect(selectSql).toContain("created_at > now() - interval '24 hours'");
    expect(selectParams[0]).toEqual([...unsortedIds].sort());
  });

  it('re-verifies the version under the row lock and sets deliveredAt only for DELIVERED', async () => {
    const client = { query: jest.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rows: [{ id: '11111111-1111-4111-8111-111111111111' }] }) };
    const repository = new JobsRepository({} as DatabaseService);
    await repository.transitionStage(client as never, '11111111-1111-4111-8111-111111111111', 2, 'DELIVERED', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
    expect(client.query.mock.calls[0][0]).toContain('delivered_at = CURRENT_TIMESTAMP');
    expect(client.query.mock.calls[0][0]).toContain('WHERE id = $3 AND version = $4');
    expect(client.query.mock.calls[0][1]).toEqual(['DELIVERED', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 2]);

    const staleClient = { query: jest.fn().mockResolvedValueOnce({ rowCount: 0 }) };
    await expect(repository.transitionStage(staleClient as never, '11111111-1111-4111-8111-111111111111', 2, 'IN_PROGRESS', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false))
      .resolves.toBeNull();
    expect(staleClient.query.mock.calls[0][0]).not.toContain('delivered_at');
  });

  it('appends an immutable stage event with the previous stage, target stage and optional reason', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new JobsRepository({} as DatabaseService);
    await repository.recordTransition(client as never, '11111111-1111-4111-8111-111111111111', 'QUALITY_CHECK', 'IN_PROGRESS', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Paint defect found');
    expect(client.query.mock.calls[0][0]).toContain('INSERT INTO job_stage_events');
    expect(client.query.mock.calls[0][1]).toEqual(['11111111-1111-4111-8111-111111111111', 'QUALITY_CHECK', 'IN_PROGRESS', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Paint defect found']);
  });

  it('lists stage history oldest-first by default and validates the sort allowlist', async () => {
    const queryValue = jest.fn().mockResolvedValue(2);
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new JobsRepository({ queryValue, query } as unknown as DatabaseService);
    await repository.listStageEvents('11111111-1111-4111-8111-111111111111', { page: 1, pageSize: 20 });
    expect(query.mock.calls[0][0]).toContain('transitioned_at ASC');
    await expect(repository.listStageEvents('11111111-1111-4111-8111-111111111111', { page: 1, pageSize: 20, sort: 'toStage' })).rejects.toThrow('INVALID_SORT');
  });

  it('computes quality-check, invoice and checklist guards from parameterized queries', async () => {
    const repository = new JobsRepository({} as DatabaseService);
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ count: 2 }], rowCount: 1 }) };
    await expect(repository.countIncompleteWorkItems(client as never, '11111111-1111-4111-8111-111111111111')).resolves.toBe(2);
    expect(client.query.mock.calls[0][1]).toEqual(['11111111-1111-4111-8111-111111111111']);

    const qcClient = { query: jest.fn().mockResolvedValue({ rows: [{ result: 'FAILED' }] }) };
    await expect(repository.findLatestQualityCheck(qcClient as never, '11111111-1111-4111-8111-111111111111')).resolves.toEqual({ result: 'FAILED' });

    const invoiceClient = { query: jest.fn().mockResolvedValue({ rowCount: 1 }) };
    await expect(repository.hasNonVoidInvoice(invoiceClient as never, '11111111-1111-4111-8111-111111111111')).resolves.toBe(true);
  });

  it('generates the DRAFT invoice from active labor, net issued parts and active sublet costs with parameterized ids', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: '55555555-5555-4555-8555-555555555555' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const repository = new JobsRepository({} as DatabaseService);
    const invoiceId = await repository.generateDraftInvoice(client as never, '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(invoiceId).toBe('55555555-5555-4555-8555-555555555555');
    expect(client.query.mock.calls[0][0]).toContain("status = 'ACTIVE'");
    expect(client.query.mock.calls[0][0]).toContain('finance_settings');
    expect(client.query.mock.calls[1][0]).toContain("'LABOR_ENTRY'");
    expect(client.query.mock.calls[2][0]).toContain("'PART_ISSUE'");
    expect(client.query.mock.calls[3][0]).toContain("'SUBLET_ENTRY'");
    expect(client.query.mock.calls[1][1]).toEqual(['55555555-5555-4555-8555-555555555555', '11111111-1111-4111-8111-111111111111']);
  });
});

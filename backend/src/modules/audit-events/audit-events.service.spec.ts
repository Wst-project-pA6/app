import { AuditEventsService } from './audit-events.service';

describe('AuditEventsService', () => {
  const actor = { id: 'actor-1', roles: ['SYSTEM_ADMIN'] } as never;

  function makeService(auditOverrides: Partial<Record<'list' | 'getById' | 'record', jest.Mock>> = {}) {
    const client = { query: jest.fn() };
    const audit = {
      list: jest.fn().mockResolvedValue({ rows: [], totalItems: 0 }),
      getById: jest.fn().mockResolvedValue(null),
      record: jest.fn().mockResolvedValue(undefined),
      ...auditOverrides,
    };
    const transaction = { runInTransaction: jest.fn((work: (c: unknown) => unknown) => work(client)) };
    const service = new AuditEventsService(audit as never, transaction as never);
    return { service, audit, client };
  }

  it('lists events, mapping rows and auditing the read once without recursion', async () => {
    const row = {
      id: 'a1', occurred_at: new Date('2026-01-01T00:00:00Z'), actor_user_id: 'u1',
      actor_roles: ['TECHNICIAN'], action: 'JOB_CARD.CREATE', entity_type: 'JOB_CARD',
      entity_id: 'j1', outcome: 'SUCCESS', request_id: 'req-1', summary: 'Created', changes: null,
    };
    const { service, audit } = makeService({ list: jest.fn().mockResolvedValue({ rows: [row], totalItems: 1 }) });

    const result = await service.list({ page: 1, pageSize: 20 } as never, actor);

    expect(result).toEqual({
      items: [{
        id: 'a1', occurredAt: row.occurred_at, actorUserId: 'u1', actorRoles: ['TECHNICIAN'],
        action: 'JOB_CARD.CREATE', entityType: 'JOB_CARD', entityId: 'j1', outcome: 'SUCCESS',
        requestId: 'req-1', summary: 'Created',
      }],
      page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'AUDIT_EVENT.READ', entityType: 'AUDIT_EVENT', outcome: 'SUCCESS',
    }));
  });

  it('rejects from >= to', async () => {
    const { service } = makeService();
    await expect(
      service.list({ page: 1, pageSize: 20, from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' } as never, actor),
    ).rejects.toThrow('From must be before to');
  });

  it('maps an unsupported sort field to a 400', async () => {
    const { service } = makeService({ list: jest.fn().mockRejectedValue(new Error('INVALID_SORT')) });
    await expect(service.list({ page: 1, pageSize: 20, sort: 'action' } as never, actor)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('get returns 404 when the audit event does not exist', async () => {
    const { service } = makeService({ getById: jest.fn().mockResolvedValue(null) });
    await expect(service.get('missing', actor)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('get audits the read and maps the row', async () => {
    const row = {
      id: 'a1', occurred_at: new Date(), actor_user_id: null, actor_roles: [],
      action: 'AUDIT_EVENT.READ', entity_type: 'AUDIT_EVENT', entity_id: null, outcome: 'SUCCESS',
      request_id: 'req-1', summary: null, changes: null,
    };
    const { service, audit } = makeService({ getById: jest.fn().mockResolvedValue(row) });
    const result = await service.get('a1', actor);
    expect(result.id).toBe('a1');
    expect(result).not.toHaveProperty('actorUserId');
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'AUDIT_EVENT.READ', entityId: 'a1',
    }));
  });
});

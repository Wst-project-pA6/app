import { RequestContext } from '../request-context/request-context';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  it('writes a parameterized append-only audit row tagged with the current request id', async () => {
    const requestContext = new RequestContext();
    const service = new AuditService(requestContext);
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await requestContext.run({ requestId: 'req-123' }, () =>
      service.record(client as never, {
        actorUserId: 'user1', actorRoles: ['TECHNICIAN'], action: 'LABOR_ENTRY.CREATE',
        entityType: 'LABOR_ENTRY', entityId: 'l1', outcome: 'SUCCESS', summary: 'Logged labor',
        changes: [{ field: 'amount', before: null, after: '135.0000' }],
      }));
    expect(client.query.mock.calls[0][0]).toContain('INSERT INTO audit_events');
    expect(client.query.mock.calls[0][1]).toEqual([
      'user1', ['TECHNICIAN'], 'LABOR_ENTRY.CREATE', 'LABOR_ENTRY', 'l1', 'SUCCESS', 'req-123', 'Logged labor',
      JSON.stringify([{ field: 'amount', before: null, after: '135.0000' }]),
    ]);
  });

  it('falls back to "unknown" outside of a request context', async () => {
    const requestContext = new RequestContext();
    const service = new AuditService(requestContext);
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await service.record(client as never, {
      actorUserId: 'user1', actorRoles: [], action: 'JOB_CARD.TRANSITION', entityType: 'JOB_CARD', outcome: 'SUCCESS',
    });
    expect(client.query.mock.calls[0][1]).toEqual(['user1', [], 'JOB_CARD.TRANSITION', 'JOB_CARD', null, 'SUCCESS', 'unknown', null, null]);
  });

  it('redacts sensitive change values before writing the row', async () => {
    const requestContext = new RequestContext();
    const service = new AuditService(requestContext);
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    await requestContext.run({ requestId: 'req-1' }, () =>
      service.record(client as never, {
        actorUserId: 'user1', actorRoles: [], action: 'USER.UPDATE', entityType: 'USER', outcome: 'SUCCESS',
        changes: [{ field: 'passwordHash', before: 'a', after: 'b' }],
      }));
    expect(client.query.mock.calls[0][1][8]).toBe(JSON.stringify([{ field: 'passwordHash', before: '[REDACTED]', after: '[REDACTED]' }]));
  });

  it('getById returns a redacted row, or null when not found', async () => {
    const requestContext = new RequestContext();
    const service = new AuditService(requestContext);
    const row = {
      id: 'a1', occurred_at: new Date(), actor_user_id: 'u1', actor_roles: ['SYSTEM_ADMIN'],
      action: 'AUDIT_EVENT.READ', entity_type: 'AUDIT_EVENT', entity_id: null, outcome: 'SUCCESS',
      request_id: 'req-1', summary: null,
      changes: [{ field: 'accessToken', before: 'a', after: 'b' }],
    };
    const client = { query: jest.fn().mockResolvedValue({ rows: [row] }) };
    const result = await service.getById(client as never, 'a1');
    expect(result?.changes).toEqual([{ field: 'accessToken', before: '[REDACTED]', after: '[REDACTED]' }]);

    const emptyClient = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    expect(await service.getById(emptyClient as never, 'missing')).toBeNull();
  });

  it('list applies filters, default sort, pagination and redaction', async () => {
    const requestContext = new RequestContext();
    const service = new AuditService(requestContext);
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ count: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'a1', changes: null }] }),
    };
    const result = await service.list(
      client as never,
      { actorUserId: 'u1', action: 'JOB_CARD.CREATE', entityType: 'JOB_CARD', entityId: 'j1', outcome: 'SUCCESS', from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' },
      { page: 1, pageSize: 20 },
    );
    expect(result.totalItems).toBe(1);
    expect(result.rows).toEqual([{ id: 'a1', changes: null }]);
    const [countSql] = client.query.mock.calls[0];
    expect(countSql).toContain('WHERE');
    const [listSql, listParams] = client.query.mock.calls[1];
    expect(listSql).toContain('ORDER BY occurred_at DESC, id ASC');
    expect(listParams).toEqual(['2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z', 'u1', 'JOB_CARD.CREATE', 'JOB_CARD', 'j1', 'SUCCESS', 20, 0]);
  });

  it('list rejects an unsupported sort field', async () => {
    const requestContext = new RequestContext();
    const service = new AuditService(requestContext);
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ count: 0 }] }) };
    await expect(service.list(client as never, {}, { page: 1, pageSize: 20, sort: 'action' })).rejects.toThrow('INVALID_SORT');
  });
});

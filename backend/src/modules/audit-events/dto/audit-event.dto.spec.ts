import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditEventListQuery } from './audit-event.dto';

describe('AuditEventListQuery validation', () => {
  it('accepts a fully populated valid filter set', async () => {
    const dto = plainToInstance(AuditEventListQuery, {
      page: 1, pageSize: 20, sort: '-occurredAt',
      from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z',
      actorUserId: '11111111-1111-4111-8111-111111111111',
      action: 'JOB_CARD.CREATE', entityType: 'JOB_CARD',
      entityId: '22222222-2222-4222-8222-222222222222', outcome: 'SUCCESS',
    });
    await expect(validate(dto, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
  });

  it('rejects a non-UTC timestamp, an invalid UUID, and an unknown outcome', async () => {
    const badFrom = plainToInstance(AuditEventListQuery, { page: 1, pageSize: 20, from: '2026-01-01T00:00:00+02:00' });
    expect((await validate(badFrom)).length).toBeGreaterThan(0);

    const badActor = plainToInstance(AuditEventListQuery, { page: 1, pageSize: 20, actorUserId: 'not-a-uuid' });
    expect((await validate(badActor)).length).toBeGreaterThan(0);

    const badOutcome = plainToInstance(AuditEventListQuery, { page: 1, pageSize: 20, outcome: 'MAYBE' });
    expect((await validate(badOutcome)).length).toBeGreaterThan(0);
  });

  it('rejects an action or entityType longer than the schema allows', async () => {
    const longAction = plainToInstance(AuditEventListQuery, { page: 1, pageSize: 20, action: 'A'.repeat(81) });
    expect((await validate(longAction)).length).toBeGreaterThan(0);

    const longEntityType = plainToInstance(AuditEventListQuery, { page: 1, pageSize: 20, entityType: 'A'.repeat(61) });
    expect((await validate(longEntityType)).length).toBeGreaterThan(0);
  });
});

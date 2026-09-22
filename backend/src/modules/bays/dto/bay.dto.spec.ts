import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BayCalendarQuery, BayStatus, CreateBayDto, UpdateBayDto } from './bay.dto';

describe('bay DTO validation', () => {
  it('accepts contract-valid create and update payloads', async () => {
    const create = plainToInstance(CreateBayDto, {
      organizationScopeId: '22222222-2222-4222-8222-222222222222',
      code: 'B1', name: 'Bay 1', capacity: 4,
    });
    const update = plainToInstance(UpdateBayDto, { status: BayStatus.MAINTENANCE });
    await expect(validate(create, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
    await expect(validate(update, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
  });

  it('rejects invalid UUID, capacity, enum, unknown and empty patch values', async () => {
    const create = plainToInstance(CreateBayDto, {
      organizationScopeId: 'not-a-uuid', code: '', name: 'x', capacity: -1, extra: true,
    });
    const update = plainToInstance(UpdateBayDto, {});
    expect((await validate(create, { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
    expect((await validate(update, { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
  });

  it('rejects non-UTC calendar timestamps', async () => {
    const query = plainToInstance(BayCalendarQuery, {
      from: '2026-01-01T00:00:00+02:00', to: '2026-01-02T00:00:00Z',
    });
    expect((await validate(query)).some((error) => error.property === 'from')).toBe(true);
  });
});

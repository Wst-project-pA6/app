import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateJobCardDto, JobTransitionRequest, UpdateJobCardDto, UpdateWorkItemDto } from './job.dto';

describe('job DTO validation', () => {
  it('accepts create, nested checklist and versioned metadata update payloads', async () => {
    const create = plainToInstance(CreateJobCardDto, {
      vehicleId: '11111111-1111-4111-8111-111111111111', complaint: 'Brake noise',
      serviceType: 'REPAIR', priority: 'NORMAL', mileageAtIntake: 100,
      expectedCompletionAt: '2026-10-02T15:00:00Z', workItems: [{ description: 'Inspect brakes' }],
    });
    const update = plainToInstance(UpdateJobCardDto, { version: 1, priority: 'HIGH' });
    await expect(validate(create, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
    await expect(validate(update, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
  });

  it('rejects lifecycle fields, malformed UUIDs and empty permitted patches', async () => {
    const create = plainToInstance(CreateJobCardDto, {
      vehicleId: 'bad', complaint: 'x', serviceType: 'BAD', priority: 'NORMAL', mileageAtIntake: -1,
      expectedCompletionAt: 'not-date', stage: 'IN_PROGRESS',
    });
    const update = plainToInstance(UpdateJobCardDto, { version: 1 });
    const workItem = plainToInstance(UpdateWorkItemDto, {});
    expect((await validate(create, { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
    expect((await validate(update, { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
    expect((await validate(workItem, { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
  });

  it('rejects non-UTC job timestamps', async () => {
    const create = plainToInstance(CreateJobCardDto, {
      vehicleId: '33333333-3333-4333-8333-333333333333', complaint: 'Brake noise', serviceType: 'REPAIR',
      priority: 'NORMAL', mileageAtIntake: 100, expectedCompletionAt: '2026-10-02T15:00:00+02:00',
    });
    expect((await validate(create)).some((error) => error.property === 'expectedCompletionAt')).toBe(true);
  });

  it('validates transition requests and rejects unknown fields', async () => {
    const valid = plainToInstance(JobTransitionRequest, { toStage: 'IN_PROGRESS', expectedFromStage: 'RECEIVED' });
    await expect(validate(valid, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);

    const withExtra = plainToInstance(JobTransitionRequest, { toStage: 'IN_PROGRESS', expectedFromStage: 'RECEIVED', bogus: true });
    expect((await validate(withExtra, { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);

    const badStage = plainToInstance(JobTransitionRequest, { toStage: 'NOT_A_STAGE', expectedFromStage: 'RECEIVED' });
    expect((await validate(badStage)).length).toBeGreaterThan(0);
  });
});

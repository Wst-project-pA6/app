import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LaborEntryCreateRequest, LaborEntryUpdateRequest, VoidLaborEntryRequest } from './labor.dto';

describe('labor DTO validation', () => {
  it('accepts a valid create request and rejects a non-date-only workDate', async () => {
    const valid = plainToInstance(LaborEntryCreateRequest, { workDate: '2026-10-02', durationMinutes: 90 });
    await expect(validate(valid, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);

    const bad = plainToInstance(LaborEntryCreateRequest, { workDate: '2026-10-02T00:00:00Z', durationMinutes: 90 });
    expect((await validate(bad)).length).toBeGreaterThan(0);

    const notACalendarDate = plainToInstance(LaborEntryCreateRequest, { workDate: '2026-13-01', durationMinutes: 90 });
    expect((await validate(notACalendarDate)).length).toBeGreaterThan(0);
  });

  it('requires changeReason and at least one field to correct', async () => {
    const missingField = plainToInstance(LaborEntryUpdateRequest, { changeReason: 'Forgot to log full time' });
    expect((await validate(missingField, { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);

    const missingReason = plainToInstance(LaborEntryUpdateRequest, { durationMinutes: 60 });
    expect((await validate(missingReason, { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);

    const valid = plainToInstance(LaborEntryUpdateRequest, { durationMinutes: 60, changeReason: 'Adjusted actual time spent' });
    await expect(validate(valid, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
  });

  it('requires a reason of 3-500 characters to void', async () => {
    const tooShort = plainToInstance(VoidLaborEntryRequest, { reason: 'no' });
    expect((await validate(tooShort)).length).toBeGreaterThan(0);
    const valid = plainToInstance(VoidLaborEntryRequest, { reason: 'Logged against the wrong job' });
    await expect(validate(valid, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
  });
});

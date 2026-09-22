import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { QualityCheckCreateRequest } from './quality-check.dto';

describe('quality check DTO validation', () => {
  it('accepts a valid PASSED result without notes and a FAILED result with notes and evidence', async () => {
    const passed = plainToInstance(QualityCheckCreateRequest, { result: 'PASSED' });
    await expect(validate(passed, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);

    const failed = plainToInstance(QualityCheckCreateRequest, {
      result: 'FAILED', notes: 'Paint defect on rear bumper', evidenceAttachmentIds: ['11111111-1111-4111-8111-111111111111'],
    });
    await expect(validate(failed, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
  });

  it('rejects unknown results and unknown fields', async () => {
    const badResult = plainToInstance(QualityCheckCreateRequest, { result: 'MAYBE' });
    expect((await validate(badResult)).length).toBeGreaterThan(0);

    const extra = plainToInstance(QualityCheckCreateRequest, { result: 'PASSED', bogus: true });
    expect((await validate(extra, { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
  });
});

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { JobApprovalCreateRequest, JobApprovalDecisionRequest } from './approval.dto';

describe('approval DTO validation', () => {
  it('accepts a valid create request with an estimated Money amount', async () => {
    const dto = plainToInstance(JobApprovalCreateRequest, {
      scope: 'ADDITIONAL_WORK', description: 'Replace worn brake pads', estimatedAmount: { amount: '150.0000', currency: 'USD' },
      workItemIds: ['11111111-1111-4111-8111-111111111111'],
    });
    await expect(validate(dto, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
  });

  it('rejects malformed money, unknown scopes and unknown fields', async () => {
    const badMoney = plainToInstance(JobApprovalCreateRequest, {
      scope: 'INITIAL_WORK', description: 'Initial diagnostic and repair', estimatedAmount: { amount: 'abc', currency: 'usd' },
    });
    expect((await validate(badMoney)).length).toBeGreaterThan(0);

    const badScope = plainToInstance(JobApprovalCreateRequest, { scope: 'FREE_WORK', description: 'Initial diagnostic and repair' });
    expect((await validate(badScope)).length).toBeGreaterThan(0);

    const extra = plainToInstance(JobApprovalCreateRequest, { scope: 'SUBLET', description: 'Tow to paint shop', bogus: true });
    expect((await validate(extra, { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
  });

  it('validates decision requests require decision, method and approvedByName', async () => {
    const valid = plainToInstance(JobApprovalDecisionRequest, { decision: 'APPROVED', method: 'PHONE', approvedByName: 'Jane Doe' });
    await expect(validate(valid, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);

    const missing = plainToInstance(JobApprovalDecisionRequest, { decision: 'APPROVED' });
    expect((await validate(missing)).length).toBeGreaterThan(0);
  });
});

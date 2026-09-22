import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  ApprovalTierDto,
  PurchaseApprovalPolicyUpdateDto,
} from './purchase-approval-policy.dto';

describe('PurchaseApprovalPolicyDto', () => {
  it('validates a correct update payload', async () => {
    const dto = plainToInstance(PurchaseApprovalPolicyUpdateDto, {
      version: 1,
      tiers: [
        { minimumTotal: '0.0000', requiredApprovals: 1 },
        { minimumTotal: '5000.0000', requiredApprovals: 2 },
      ],
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects missing or invalid version', async () => {
    const dto = plainToInstance(PurchaseApprovalPolicyUpdateDto, {
      version: 0,
      tiers: [{ minimumTotal: '0.0000', requiredApprovals: 1 }],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects tiers with invalid requiredApprovals', async () => {
    const tier = plainToInstance(ApprovalTierDto, {
      minimumTotal: '100.00',
      requiredApprovals: 3,
    });
    const errors = await validate(tier);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects negative minimumTotal', async () => {
    const tier = plainToInstance(ApprovalTierDto, {
      minimumTotal: '-10.00',
      requiredApprovals: 1,
    });
    const errors = await validate(tier);
    expect(errors.length).toBeGreaterThan(0);
  });
});

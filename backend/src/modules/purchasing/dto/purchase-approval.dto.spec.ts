import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PurchaseApprovalRequestDto } from './purchase-approval.dto';

describe('PurchaseApprovalDto', () => {
  it('validates APPROVED without reason', async () => {
    const dto = plainToInstance(PurchaseApprovalRequestDto, {
      decision: 'APPROVED',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects REJECTED without reason', async () => {
    const dto = plainToInstance(PurchaseApprovalRequestDto, {
      decision: 'REJECTED',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates REJECTED with valid reason', async () => {
    const dto = plainToInstance(PurchaseApprovalRequestDto, {
      decision: 'REJECTED',
      reason: 'Budget exceeded for this quarter',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects invalid decision enum', async () => {
    const dto = plainToInstance(PurchaseApprovalRequestDto, {
      decision: 'MAYBE',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  PurchaseOrderCreateDto,
  PurchaseOrderTransitionDto,
  PurchaseOrderUpdateDto,
} from './purchase-order.dto';

describe('PurchaseOrderDto', () => {
  it('validates a valid create payload', async () => {
    const dto = plainToInstance(PurchaseOrderCreateDto, {
      vendorId: '11111111-1111-4111-8111-111111111111',
      storeId: '22222222-2222-4222-8222-222222222222',
      lines: [
        {
          partId: '33333333-3333-4333-8333-333333333333',
          quantityOrdered: 5,
          unitCost: { amount: '12.5000', currency: 'SAR' },
        },
      ],
      expectedDeliveryDate: '2026-10-01',
      notes: 'Initial stock order',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects create without lines', async () => {
    const dto = plainToInstance(PurchaseOrderCreateDto, {
      vendorId: '11111111-1111-4111-8111-111111111111',
      storeId: '22222222-2222-4222-8222-222222222222',
      lines: [],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates transition to PENDING_APPROVAL without reason', async () => {
    const dto = plainToInstance(PurchaseOrderTransitionDto, {
      toStatus: 'PENDING_APPROVAL',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects transition to CANCELLED without reason', async () => {
    const dto = plainToInstance(PurchaseOrderTransitionDto, {
      toStatus: 'CANCELLED',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates transition to CANCELLED with valid reason', async () => {
    const dto = plainToInstance(PurchaseOrderTransitionDto, {
      toStatus: 'CANCELLED',
      reason: 'Supplier out of stock',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('validates update payload with version and fields', async () => {
    const dto = plainToInstance(PurchaseOrderUpdateDto, {
      version: 1,
      notes: 'Updated notes',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

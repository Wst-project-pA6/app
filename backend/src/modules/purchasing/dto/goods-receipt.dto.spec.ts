import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GoodsReceiptCreateDto } from './goods-receipt.dto';

describe('GoodsReceiptDto', () => {
  it('validates accepted goods receipt payload', async () => {
    const dto = plainToInstance(GoodsReceiptCreateDto, {
      deliveryReference: 'DEL-12345',
      lines: [
        {
          purchaseOrderLineId: '11111111-1111-4111-8111-111111111111',
          quantityReceived: 10,
          quantityAccepted: 10,
          quantityRejected: 0,
        },
      ],
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects rejected quantity without rejectionReason', async () => {
    const dto = plainToInstance(GoodsReceiptCreateDto, {
      lines: [
        {
          purchaseOrderLineId: '11111111-1111-4111-8111-111111111111',
          quantityReceived: 10,
          quantityAccepted: 8,
          quantityRejected: 2,
        },
      ],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates rejected quantity with rejectionReason', async () => {
    const dto = plainToInstance(GoodsReceiptCreateDto, {
      lines: [
        {
          purchaseOrderLineId: '11111111-1111-4111-8111-111111111111',
          quantityReceived: 10,
          quantityAccepted: 8,
          quantityRejected: 2,
          rejectionReason: 'Damaged in transit',
        },
      ],
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});

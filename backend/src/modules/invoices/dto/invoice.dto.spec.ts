import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  DiscountDto,
  DiscountType,
  InvoiceListQuery,
  InvoiceTransitionRequestDto,
  InvoiceUpdateRequestDto,
  MoneyDto,
  PaymentCreateRequestDto,
  PaymentMethod,
  CustomerStatementQueryDto,
} from './invoice.dto';

describe('Invoice DTO validation', () => {
  it('validates valid MoneyDto', async () => {
    const dto = plainToInstance(MoneyDto, {
      amount: '150.0000',
      currency: 'EGP',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid MoneyDto', async () => {
    const dto = plainToInstance(MoneyDto, {
      amount: 'invalid',
      currency: 'TOOLONG',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates valid DiscountDto', async () => {
    const dto = plainToInstance(DiscountDto, {
      type: DiscountType.PERCENT,
      value: '10.0000',
      reason: 'Special customer loyalty discount',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects short reason in DiscountDto', async () => {
    const dto = plainToInstance(DiscountDto, {
      type: DiscountType.AMOUNT,
      value: '50.0000',
      reason: 'ab',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates valid InvoiceUpdateRequestDto', async () => {
    const dto = plainToInstance(InvoiceUpdateRequestDto, {
      version: 1,
      notes: 'Customer requested invoice notes',
      discount: {
        type: DiscountType.AMOUNT,
        value: '20.0000',
        reason: 'Promo coupon applied',
      },
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid version in InvoiceUpdateRequestDto', async () => {
    const dto = plainToInstance(InvoiceUpdateRequestDto, {
      version: 0,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates valid InvoiceTransitionRequestDto', async () => {
    const dto = plainToInstance(InvoiceTransitionRequestDto, {
      toStatus: 'ISSUED',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('validates VOID with reason in InvoiceTransitionRequestDto', async () => {
    const dto = plainToInstance(InvoiceTransitionRequestDto, {
      toStatus: 'VOID',
      reason: 'Billing error requested by accountant',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid toStatus in InvoiceTransitionRequestDto', async () => {
    const dto = plainToInstance(InvoiceTransitionRequestDto, {
      toStatus: 'PAID' as never,
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates PaymentCreateRequestDto', async () => {
    const dto = plainToInstance(PaymentCreateRequestDto, {
      method: PaymentMethod.BANK_TRANSFER,
      reference: 'TXN-987654321',
      amount: {
        amount: '350.0000',
        currency: 'EGP',
      },
      paidAt: '2026-09-22T10:00:00Z',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects missing reference in PaymentCreateRequestDto', async () => {
    const dto = plainToInstance(PaymentCreateRequestDto, {
      method: PaymentMethod.CASH,
      reference: '',
      amount: {
        amount: '100.0000',
        currency: 'EGP',
      },
      paidAt: '2026-09-22T10:00:00Z',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates InvoiceListQuery', async () => {
    const dto = plainToInstance(InvoiceListQuery, {
      page: 1,
      pageSize: 20,
      sort: '-createdAt',
      from: '2026-01-01T00:00:00Z',
      to: '2026-12-31T23:59:59Z',
      status: 'ISSUED',
      invoiceNumber: 'INV-2026-000001',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('validates CustomerStatementQueryDto', async () => {
    const dto = plainToInstance(CustomerStatementQueryDto, {
      from: '2026-01-01T00:00:00Z',
      to: '2026-06-30T23:59:59Z',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});

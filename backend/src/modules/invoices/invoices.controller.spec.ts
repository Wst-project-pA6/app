import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import {
  InvoiceListQuery,
  InvoiceTransitionRequestDto,
  InvoiceUpdateRequestDto,
  PaymentCreateRequestDto,
  PaymentMethod,
} from './dto/invoice.dto';

describe('InvoicesController', () => {
  const service = {
    listInvoices: jest.fn(),
    getInvoice: jest.fn(),
    updateInvoice: jest.fn(),
    transitionInvoice: jest.fn(),
    recordPayment: jest.fn(),
  } as unknown as InvoicesService;

  const controller = new InvoicesController(service);
  const reflector = new Reflector();
  const handler = (name: string): ((...args: unknown[]) => unknown) =>
    Reflect.get(InvoicesController.prototype, name) as (...args: unknown[]) => unknown;

  afterEach(() => jest.clearAllMocks());

  it('declares the contract permissions on every invoice endpoint', () => {
    expect(reflector.get('wst_permissions', handler('list'))).toEqual(['invoices.read']);
    expect(reflector.get('wst_permissions', handler('get'))).toEqual(['invoices.read']);
    expect(reflector.get('wst_permissions', handler('update'))).toEqual(['invoices.manage']);
    expect(reflector.get('wst_permissions', handler('transition'))).toEqual(['invoices.manage']);
    expect(reflector.get('wst_permissions', handler('recordPayment'))).toEqual(['payments.record']);
  });

  it('delegates operations to InvoicesService and returns results', async () => {
    const actor = { id: 'user-1' } as never;
    const query: InvoiceListQuery = { page: 1, pageSize: 20 };
    const invoiceId = '11111111-1111-4111-8111-111111111111';
    const invoice = { id: invoiceId };
    const pageResult = { items: [invoice], page: {} };
    const updateDto: InvoiceUpdateRequestDto = { version: 1, notes: 'Test notes' };
    const transitionDto: InvoiceTransitionRequestDto = { toStatus: 'ISSUED' };
    const paymentDto: PaymentCreateRequestDto = {
      method: PaymentMethod.CASH,
      reference: 'REF-001',
      amount: { amount: '100.0000', currency: 'EGP' },
      paidAt: '2026-09-22T10:00:00Z',
    };
    const paymentRef = { id: 'payment-1' };

    (service.listInvoices as jest.Mock).mockResolvedValue(pageResult);
    (service.getInvoice as jest.Mock).mockResolvedValue(invoice);
    (service.updateInvoice as jest.Mock).mockResolvedValue(invoice);
    (service.transitionInvoice as jest.Mock).mockResolvedValue(invoice);
    (service.recordPayment as jest.Mock).mockResolvedValue(paymentRef);

    await expect(controller.list(query, actor)).resolves.toBe(pageResult);
    await expect(controller.get(invoiceId, actor)).resolves.toBe(invoice);
    await expect(controller.update(invoiceId, updateDto, actor)).resolves.toBe(invoice);
    await expect(controller.transition(invoiceId, transitionDto, actor)).resolves.toBe(invoice);
    await expect(controller.recordPayment(invoiceId, paymentDto, 'key-12345678', actor)).resolves.toBe(paymentRef);

    expect((service.listInvoices as jest.Mock).mock.calls[0]).toEqual([query, actor]);
    expect((service.getInvoice as jest.Mock).mock.calls[0]).toEqual([invoiceId, actor]);
    expect((service.updateInvoice as jest.Mock).mock.calls[0]).toEqual([invoiceId, updateDto, actor]);
    expect((service.transitionInvoice as jest.Mock).mock.calls[0]).toEqual([invoiceId, transitionDto, actor]);
    expect((service.recordPayment as jest.Mock).mock.calls[0]).toEqual([invoiceId, paymentDto, 'key-12345678', actor]);
  });

  it('validates UUID path parameters', async () => {
    await expect(
      new ParseUUIDPipe().transform('not-a-uuid', {
        type: 'param',
        metatype: String,
        data: 'invoiceId',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

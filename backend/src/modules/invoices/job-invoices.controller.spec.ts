import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JobInvoicesController } from './job-invoices.controller';
import { InvoicesService } from './invoices.service';

describe('JobInvoicesController', () => {
  const service = {
    getJobInvoiceSummary: jest.fn(),
    regenerateJobInvoice: jest.fn(),
  } as unknown as InvoicesService;

  const controller = new JobInvoicesController(service);
  const reflector = new Reflector();
  const handler = (name: string): ((...args: unknown[]) => unknown) =>
    Reflect.get(JobInvoicesController.prototype, name) as (...args: unknown[]) => unknown;

  afterEach(() => jest.clearAllMocks());

  it('declares the contract permissions on job invoice endpoints', () => {
    expect(reflector.get('wst_permissions', handler('getSummary'))).toEqual([
      'invoices.read',
      'jobs.read',
    ]);
    expect(reflector.get('wst_permissions', handler('regenerateInvoice'))).toEqual([
      'invoices.manage',
    ]);
  });

  it('delegates operations to InvoicesService and returns results', async () => {
    const actor = { id: 'user-1' } as never;
    const jobId = '11111111-1111-4111-8111-111111111111';
    const summary = { jobId, lines: [] };
    const invoice = { id: 'inv-1', jobId };

    (service.getJobInvoiceSummary as jest.Mock).mockResolvedValue(summary);
    (service.regenerateJobInvoice as jest.Mock).mockResolvedValue(invoice);

    await expect(controller.getSummary(jobId, actor)).resolves.toBe(summary);
    await expect(controller.regenerateInvoice(jobId, actor)).resolves.toBe(invoice);

    expect((service.getJobInvoiceSummary as jest.Mock).mock.calls[0]).toEqual([jobId, actor]);
    expect((service.regenerateJobInvoice as jest.Mock).mock.calls[0]).toEqual([jobId, actor]);
  });

  it('validates UUID path parameters', async () => {
    await expect(
      new ParseUUIDPipe().transform('not-a-uuid', {
        type: 'param',
        metatype: String,
        data: 'jobId',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

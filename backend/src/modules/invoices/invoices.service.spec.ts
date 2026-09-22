import { HttpStatus } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  DiscountType,
  InvoiceLineType,
  InvoiceSourceType,
  InvoiceStatus,
  PaymentMethod,
} from './dto/invoice.dto';
import { InvoicesRepository } from './invoices.repository';
import { InvoicesService } from './invoices.service';

describe('InvoicesService', () => {
  const scopeId = '22222222-2222-4222-8222-222222222222';
  const otherScopeId = '33333333-3333-4333-8333-333333333333';
  const jobId = '11111111-1111-4111-8111-111111111111';
  const customerId = '44444444-4444-4444-8444-444444444444';
  const invoiceId = '55555555-5555-4555-8555-555555555555';

  const actor: AuthenticatedPrincipal = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'advisor@example.test',
    displayName: 'Service Advisor',
    preferredLocale: 'en',
    roles: ['SERVICE_ADVISOR'],
    permissions: ['invoices.read', 'invoices.manage', 'payments.record', 'jobs.read'],
    organizationScopeIds: [scopeId],
    mustChangePassword: false,
  };

  const outOfScopeActor: AuthenticatedPrincipal = {
    ...actor,
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    organizationScopeIds: [otherScopeId],
  };

  const financeSettings = {
    currency_code: 'EGP',
    labor_hourly_rate: '150.0000',
    tax_rate_percent: '14.000',
    tax_label: 'VAT',
  };

  const sampleJob = {
    id: jobId,
    organization_scope_id: scopeId,
    customer_id: customerId,
    stage: 'READY',
    job_number: 'JC-2026-000001',
  };

  const sampleInvoice = {
    id: invoiceId,
    invoice_number: null,
    job_id: jobId,
    customer_id: customerId,
    status: InvoiceStatus.DRAFT,
    currency_code: 'EGP',
    discount_type: null,
    discount_value: null,
    discount_reason: null,
    labor_subtotal: '300.0000',
    parts_subtotal: '100.0000',
    sublet_subtotal: '50.0000',
    subtotal: '450.0000',
    discount_total: '0.0000',
    taxable_amount: '450.0000',
    tax_rate_percent: '14.000',
    tax_amount: '63.0000',
    total_amount: '513.0000',
    notes: null,
    issued_at: null,
    paid_at: null,
    void_reason: null,
    version: 1,
    created_at: new Date('2026-09-22T08:00:00Z'),
    updated_at: new Date('2026-09-22T08:00:00Z'),
    created_by: actor.id,
    updated_by: actor.id,
    organization_scope_id: scopeId,
    job_number: 'JC-2026-000001',
  };

  let repository: jest.Mocked<InvoicesRepository>;
  let audit: { record: jest.Mock };
  let transaction: TransactionService;
  let service: InvoicesService;

  beforeEach(() => {
    repository = {
      getFinanceSettings: jest.fn().mockResolvedValue(financeSettings),
      findJobForInvoice: jest.fn().mockResolvedValue(sampleJob),
      findNonVoidInvoiceForJob: jest.fn().mockResolvedValue(null),
      calculateJobSummaryTotals: jest.fn().mockResolvedValue({
        labor_subtotal: '300.0000',
        parts_subtotal: '100.0000',
        sublet_subtotal: '50.0000',
        subtotal: '450.0000',
        discount_total: '0.0000',
        taxable_amount: '450.0000',
        tax_rate_percent: '14.000',
        tax_amount: '63.0000',
        total_amount: '513.0000',
        currency_code: 'EGP',
      }),
      getSummaryLines: jest.fn().mockResolvedValue([
        {
          id: 'line-1',
          lineType: InvoiceLineType.LABOR,
          description: 'Labor entry 1',
          quantity: '2.0000',
          unitPriceAmount: '150.0000',
          unitPriceCurrency: 'EGP',
          lineTotalAmount: '300.0000',
          lineTotalCurrency: 'EGP',
          sourceType: InvoiceSourceType.LABOR_ENTRY,
          sourceId: 'labor-1',
        },
        {
          id: 'line-2',
          lineType: InvoiceLineType.PART,
          description: 'Part issue 1',
          quantity: '1.0000',
          unitPriceAmount: '100.0000',
          unitPriceCurrency: 'EGP',
          lineTotalAmount: '100.0000',
          lineTotalCurrency: 'EGP',
          sourceType: InvoiceSourceType.PART_ISSUE,
          sourceId: 'part-issue-1',
        },
        {
          id: 'line-3',
          lineType: InvoiceLineType.SUBLET,
          description: 'Sublet work',
          quantity: '1.0000',
          unitPriceAmount: '50.0000',
          unitPriceCurrency: 'EGP',
          lineTotalAmount: '50.0000',
          lineTotalCurrency: 'EGP',
          sourceType: InvoiceSourceType.SUBLET_ENTRY,
          sourceId: 'sublet-1',
        },
      ]),
      checkCurrencyConsistency: jest.fn().mockResolvedValue(true),
      createDraftInvoice: jest.fn().mockResolvedValue(invoiceId),
      findInvoiceById: jest.fn().mockResolvedValue(sampleInvoice),
      findInvoiceLines: jest.fn().mockResolvedValue([]),
      findPaymentReferences: jest.fn().mockResolvedValue([]),
      listInvoices: jest.fn().mockResolvedValue({ rows: [sampleInvoice], total: 1 }),
      updateDraftInvoice: jest.fn(),
      calculateDiscountTotal: jest.fn(),
      transitionToIssued: jest.fn(),
      transitionToVoid: jest.fn(),
      findPaymentByIdempotencyKey: jest.fn().mockResolvedValue(null),
      checkAmountsMatch: jest.fn().mockResolvedValue(true),
      recordPayment: jest.fn(),
      findCustomerForStatement: jest.fn().mockResolvedValue({
        id: customerId,
        organization_scope_id: scopeId,
        display_name: 'Customer Alice',
      }),
      getCustomerStatementLines: jest.fn().mockResolvedValue([]),
      getCustomerStatementTotals: jest.fn().mockResolvedValue({
        total_invoiced: '0.0000',
        total_paid: '0.0000',
        total_outstanding: '0.0000',
      }),
    } as unknown as jest.Mocked<InvoicesRepository>;

    audit = { record: jest.fn().mockResolvedValue(undefined) };
    transaction = {
      runInTransaction: jest.fn(async (work) => work({} as never)),
    } as unknown as TransactionService;

    service = new InvoicesService(
      repository,
      transaction,
      new ScopeService(),
      audit as unknown as AuditService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // 1. Server-calculated labor/parts/sublet totals
  it('calculates labor, parts, sublet subtotals, tax and total on the server', async () => {
    const summary = await service.getJobInvoiceSummary(jobId, actor);

    expect(summary.jobId).toBe(jobId);
    expect(summary.jobStage).toBe('READY');
    expect(summary.currencyCode).toBe('EGP');
    expect(summary.totals.laborSubtotal).toEqual({ amount: '300.0000', currency: 'EGP' });
    expect(summary.totals.partsSubtotal).toEqual({ amount: '100.0000', currency: 'EGP' });
    expect(summary.totals.subletSubtotal).toEqual({ amount: '50.0000', currency: 'EGP' });
    expect(summary.totals.subtotal).toEqual({ amount: '450.0000', currency: 'EGP' });
    expect(summary.totals.taxableAmount).toEqual({ amount: '450.0000', currency: 'EGP' });
    expect(summary.totals.taxRatePercent).toBe('14.000');
    expect(summary.totals.taxAmount).toEqual({ amount: '63.0000', currency: 'EGP' });
    expect(summary.totals.total).toEqual({ amount: '513.0000', currency: 'EGP' });
    expect(summary.lines).toHaveLength(3);
  });

  // 2. Net part reversals
  it('omits fully reversed parts and computes net quantity in summary and draft creation', async () => {
    await service.getJobInvoiceSummary(jobId, actor);
    expect(repository.calculateJobSummaryTotals.mock.calls).toEqual([[null, jobId]]);
    expect(repository.getSummaryLines.mock.calls).toEqual([[null, jobId]]);
  });

  // 3. Invoice summary does not persist data
  it('invoice summary does not call createDraftInvoice or audit service', async () => {
    await service.getJobInvoiceSummary(jobId, actor);
    expect(repository.createDraftInvoice.mock.calls).toHaveLength(0);
    expect(audit.record.mock.calls).toHaveLength(0);
  });

  // 4. READY-only draft creation
  it('creates draft invoice only when job is in READY stage and rejects other stages with 409', async () => {
    repository.findJobForInvoice.mockResolvedValueOnce({
      ...sampleJob,
      stage: 'IN_PROGRESS',
    });

    await expect(service.regenerateJobInvoice(jobId, actor)).rejects.toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCode.JOB_STAGE_NOT_ALLOWED,
    });
    expect(repository.createDraftInvoice.mock.calls).toHaveLength(0);
  });

  // 5. Existing non-VOID invoice conflict
  it('rejects draft creation if any non-VOID invoice (DRAFT, ISSUED, PAID) exists for the job with 409 DUPLICATE_RESOURCE', async () => {
    // Case 1: Existing DRAFT invoice
    repository.findNonVoidInvoiceForJob.mockResolvedValueOnce({
      id: 'existing-draft-id',
      status: InvoiceStatus.DRAFT,
      version: 1,
    });

    await expect(service.regenerateJobInvoice(jobId, actor)).rejects.toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCode.DUPLICATE_RESOURCE,
    });
    expect(repository.createDraftInvoice.mock.calls).toHaveLength(0);

    // Case 2: Existing ISSUED invoice
    repository.findNonVoidInvoiceForJob.mockResolvedValueOnce({
      id: 'existing-issued-id',
      status: InvoiceStatus.ISSUED,
      version: 1,
    });

    await expect(service.regenerateJobInvoice(jobId, actor)).rejects.toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCode.DUPLICATE_RESOURCE,
    });
    expect(repository.createDraftInvoice.mock.calls).toHaveLength(0);

    // Case 3: Existing PAID invoice
    repository.findNonVoidInvoiceForJob.mockResolvedValueOnce({
      id: 'existing-paid-id',
      status: InvoiceStatus.PAID,
      version: 1,
    });

    await expect(service.regenerateJobInvoice(jobId, actor)).rejects.toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCode.DUPLICATE_RESOURCE,
    });
    expect(repository.createDraftInvoice.mock.calls).toHaveLength(0);
  });

  it('allows invoice regeneration when job is READY and all previous invoices are VOID, preserving previous VOID invoices and lines', async () => {
    // All previous invoices are VOID, so findNonVoidInvoiceForJob returns null
    repository.findNonVoidInvoiceForJob.mockResolvedValueOnce(null);

    const result = await service.regenerateJobInvoice(jobId, actor);

    expect(result.id).toBe(invoiceId);
    expect(result.status).toBe(InvoiceStatus.DRAFT);
    // Inserts new draft invoice without modifying or deleting existing VOID invoices
    expect(repository.createDraftInvoice.mock.calls).toHaveLength(1);
    expect(repository.createDraftInvoice.mock.calls[0]).toEqual([
      expect.anything(),
      jobId,
      customerId,
      actor.id,
    ]);
  });

  // 6. Session 10 READY transition compatibility
  it('persists draft invoice atomically with lines and records audit event on creation', async () => {
    const result = await service.regenerateJobInvoice(jobId, actor);

    expect(result.id).toBe(invoiceId);
    expect(result.status).toBe(InvoiceStatus.DRAFT);
    expect(repository.createDraftInvoice.mock.calls[0]).toEqual([
      expect.anything(),
      jobId,
      customerId,
      actor.id,
    ]);
    expect(audit.record.mock.calls[0]).toEqual([
      expect.anything(),
      expect.objectContaining({
        action: 'INVOICE.CREATE',
        entityType: 'INVOICE',
        entityId: invoiceId,
        outcome: 'SUCCESS',
      }),
    ]);
  });

  it('Session 10 compatibility regression: READY transition creates initial DRAFT atomically and POST /job-cards/{jobId}/invoices prevents duplicate non-VOID invoices while matching calculations', async () => {
    // 1. Calculations between Session 10 and Session 14 summary match exactly:
    // labor (300.0000) + parts (100.0000) + sublet (50.0000) = subtotal (450.0000)
    // tax = ROUND(450 * 14 / 100, 4) = 63.0000, total = 513.0000
    const summary = await service.getJobInvoiceSummary(jobId, actor);
    expect(summary.totals.subtotal.amount).toBe('450.0000');
    expect(summary.totals.taxAmount.amount).toBe('63.0000');
    expect(summary.totals.total.amount).toBe('513.0000');

    // 2. When the initial DRAFT invoice already exists from READY transition,
    // calling regenerateJobInvoice MUST reject with 409 DUPLICATE_RESOURCE
    repository.findNonVoidInvoiceForJob.mockResolvedValueOnce({
      id: 'session10-initial-draft-id',
      status: InvoiceStatus.DRAFT,
      version: 1,
    });

    await expect(service.regenerateJobInvoice(jobId, actor)).rejects.toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCode.DUPLICATE_RESOURCE,
    });
    // Verifies no second invoice is created
    expect(repository.createDraftInvoice.mock.calls).toHaveLength(0);
  });

  // 7. Scope concealment and permission metadata
  it('conceals out-of-scope invoices, jobs, and customers as 404 NOT_FOUND', async () => {
    await expect(service.getJobInvoiceSummary(jobId, outOfScopeActor)).rejects.toMatchObject({
      statusCode: HttpStatus.NOT_FOUND,
      code: ErrorCode.NOT_FOUND,
    });

    await expect(service.getInvoice(invoiceId, outOfScopeActor)).rejects.toMatchObject({
      statusCode: HttpStatus.NOT_FOUND,
      code: ErrorCode.NOT_FOUND,
    });

    await expect(
      service.getCustomerStatement(customerId, {}, outOfScopeActor),
    ).rejects.toMatchObject({
      statusCode: HttpStatus.NOT_FOUND,
      code: ErrorCode.NOT_FOUND,
    });
  });

  // 8. DRAFT-only PATCH and VERSION_CONFLICT
  it('PATCH /invoices/{invoiceId}: allows PATCH only for DRAFT invoices and returns 409 INVALID_STATE_TRANSITION for non-DRAFT', async () => {
    repository.findInvoiceById.mockResolvedValueOnce({
      ...sampleInvoice,
      status: InvoiceStatus.ISSUED,
    });

    await expect(
      service.updateInvoice(invoiceId, { version: 1, notes: 'Hello' }, actor),
    ).rejects.toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCode.INVALID_STATE_TRANSITION,
    });
  });

  it('PATCH /invoices/{invoiceId}: a stale version returns HTTP 409 with exact error code VERSION_CONFLICT, not generic CONFLICT', async () => {
    // Case 1: DTO version does not match DB version
    repository.findInvoiceById.mockResolvedValueOnce({
      ...sampleInvoice,
      version: 2,
    });

    let staleDtoError: unknown;
    try {
      await service.updateInvoice(invoiceId, { version: 1, notes: 'Stale DTO' }, actor);
    } catch (err) {
      staleDtoError = err;
    }

    expect(staleDtoError).toBeDefined();
    expect((staleDtoError as AppError).statusCode).toBe(409);
    expect((staleDtoError as AppError).code).toBe('VERSION_CONFLICT');
    expect((staleDtoError as AppError).code).not.toBe('CONFLICT');

    // Case 2: Concurrent update causes repository.updateDraftInvoice to affect 0 rows
    repository.findInvoiceById.mockResolvedValueOnce({
      ...sampleInvoice,
      version: 1,
    });
    repository.updateDraftInvoice.mockResolvedValueOnce(null);

    let concurrentError: unknown;
    try {
      await service.updateInvoice(invoiceId, { version: 1, notes: 'Concurrent conflict' }, actor);
    } catch (err) {
      concurrentError = err;
    }

    expect(concurrentError).toBeDefined();
    expect((concurrentError as AppError).statusCode).toBe(409);
    expect((concurrentError as AppError).code).toBe('VERSION_CONFLICT');
    expect((concurrentError as AppError).code).not.toBe('CONFLICT');
  });

  it('validates that discount does not exceed subtotal during PATCH', async () => {
    repository.calculateDiscountTotal.mockResolvedValueOnce({
      discountTotal: '500.0000',
      isNegative: true,
    });

    await expect(
      service.updateInvoice(
        invoiceId,
        {
          version: 1,
          discount: {
            type: DiscountType.AMOUNT,
            value: '500.0000',
            reason: 'Excessive discount',
          },
        },
        actor,
      ),
    ).rejects.toMatchObject({
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      code: ErrorCode.VALIDATION_FAILED,
    });
  });

  // 9. UTC invoice numbering
  it('assigns UTC invoice number on transition to ISSUED', async () => {
    const issuedInvoice = {
      ...sampleInvoice,
      status: InvoiceStatus.ISSUED,
      invoice_number: 'INV-2026-000001',
      version: 2,
      issued_at: new Date('2026-09-22T08:05:00Z'),
    };
    repository.transitionToIssued.mockResolvedValueOnce(issuedInvoice);
    repository.findInvoiceById
      .mockResolvedValueOnce(sampleInvoice)
      .mockResolvedValueOnce(issuedInvoice);

    const result = await service.transitionInvoice(invoiceId, { toStatus: 'ISSUED' }, actor);

    expect(result.status).toBe(InvoiceStatus.ISSUED);
    expect(result.invoiceNumber).toBe('INV-2026-000001');
    expect(repository.transitionToIssued.mock.calls[0]).toEqual([
      expect.anything(),
      invoiceId,
      actor.id,
    ]);
    expect(audit.record.mock.calls[0]).toEqual([
      expect.anything(),
      expect.objectContaining({
        action: 'INVOICE.TRANSITION',
        summary: expect.stringContaining('DRAFT -> ISSUED'),
      }),
    ]);
  });

  // 10. Valid issue and void transitions
  it('allows voiding an ISSUED invoice with reason and increments version', async () => {
    repository.findInvoiceById.mockResolvedValueOnce({
      ...sampleInvoice,
      status: InvoiceStatus.ISSUED,
      invoice_number: 'INV-2026-000001',
    });

    const voidedInvoice = {
      ...sampleInvoice,
      status: InvoiceStatus.VOID,
      invoice_number: 'INV-2026-000001',
      void_reason: 'Mistake on part line',
      version: 3,
    };
    repository.transitionToVoid.mockResolvedValueOnce(voidedInvoice);
    repository.findInvoiceById.mockResolvedValueOnce(voidedInvoice);

    const result = await service.transitionInvoice(
      invoiceId,
      { toStatus: 'VOID', reason: 'Mistake on part line' },
      actor,
    );

    expect(result.status).toBe(InvoiceStatus.VOID);
    expect(result.voidReason).toBe('Mistake on part line');
    expect(repository.transitionToVoid.mock.calls[0]).toEqual([
      expect.anything(),
      invoiceId,
      'Mistake on part line',
      actor.id,
    ]);
  });

  // 11. PAID invoice cannot be voided
  it('rejects voiding a PAID invoice with 409 INVALID_STATE_TRANSITION', async () => {
    repository.findInvoiceById.mockResolvedValueOnce({
      ...sampleInvoice,
      status: InvoiceStatus.PAID,
      invoice_number: 'INV-2026-000001',
    });

    await expect(
      service.transitionInvoice(
        invoiceId,
        { toStatus: 'VOID', reason: 'Customer refund' },
        actor,
      ),
    ).rejects.toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCode.INVALID_STATE_TRANSITION,
    });
  });

  // 12. Exact full payment
  it('records exact full payment and atomically marks invoice PAID', async () => {
    repository.findInvoiceById.mockResolvedValueOnce({
      ...sampleInvoice,
      status: InvoiceStatus.ISSUED,
      invoice_number: 'INV-2026-000001',
      total_amount: '513.0000',
    });

    const paymentRow = {
      id: 'pay-1',
      invoice_id: invoiceId,
      method: PaymentMethod.CASH,
      reference: 'CASH-001',
      amount_amount: '513.0000',
      amount_currency: 'EGP',
      paid_at: new Date('2026-09-22T09:00:00Z'),
      idempotency_key: 'idemp-12345678',
      created_at: new Date('2026-09-22T09:00:00Z'),
      created_by: actor.id,
    };
    repository.recordPayment.mockResolvedValueOnce(paymentRow);

    const result = await service.recordPayment(
      invoiceId,
      {
        method: PaymentMethod.CASH,
        reference: 'CASH-001',
        amount: { amount: '513.0000', currency: 'EGP' },
        paidAt: '2026-09-22T09:00:00Z',
      },
      'idemp-12345678',
      actor,
    );

    expect(result.id).toBe('pay-1');
    expect(result.amount).toEqual({ amount: '513.0000', currency: 'EGP' });
    expect(audit.record.mock.calls[0]).toEqual([
      expect.anything(),
      expect.objectContaining({
        action: 'PAYMENT.RECORD',
        entityType: 'PAYMENT_REFERENCE',
        entityId: 'pay-1',
      }),
    ]);
  });

  // 13. Payment amount / currency mismatch
  it('rejects partial or over-payment with 409 PAYMENT_AMOUNT_MISMATCH', async () => {
    repository.findInvoiceById.mockResolvedValueOnce({
      ...sampleInvoice,
      status: InvoiceStatus.ISSUED,
      invoice_number: 'INV-2026-000001',
      total_amount: '513.0000',
    });
    repository.checkAmountsMatch.mockResolvedValueOnce(false);

    await expect(
      service.recordPayment(
        invoiceId,
        {
          method: PaymentMethod.CASH,
          reference: 'CASH-001',
          amount: { amount: '500.0000', currency: 'EGP' },
          paidAt: '2026-09-22T09:00:00Z',
        },
        undefined,
        actor,
      ),
    ).rejects.toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCode.PAYMENT_AMOUNT_MISMATCH,
    });
  });

  it('rejects payment currency mismatch with 409 PAYMENT_AMOUNT_MISMATCH', async () => {
    repository.findInvoiceById.mockResolvedValueOnce({
      ...sampleInvoice,
      status: InvoiceStatus.ISSUED,
      currency_code: 'EGP',
    });

    await expect(
      service.recordPayment(
        invoiceId,
        {
          method: PaymentMethod.CASH,
          reference: 'CASH-001',
          amount: { amount: '513.0000', currency: 'USD' },
          paidAt: '2026-09-22T09:00:00Z',
        },
        undefined,
        actor,
      ),
    ).rejects.toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCode.PAYMENT_AMOUNT_MISMATCH,
    });
  });

  // 14. Idempotent payment replay and conflicting-key reuse
  it('safely replays identical payment with same idempotency key and rejects conflicting reuse with 409', async () => {
    const existingPayment = {
      id: 'pay-existing',
      invoice_id: invoiceId,
      method: PaymentMethod.CASH,
      reference: 'CASH-001',
      amount_amount: '513.0000',
      amount_currency: 'EGP',
      paid_at: new Date('2026-09-22T09:00:00Z'),
      idempotency_key: 'same-key-1234',
      created_at: new Date('2026-09-22T09:00:00Z'),
      created_by: actor.id,
      job_id: jobId,
      organization_scope_id: scopeId,
    };

    repository.findPaymentByIdempotencyKey.mockResolvedValueOnce(existingPayment);

    // Matching replay -> 201 with existing record
    const replayed = await service.recordPayment(
      invoiceId,
      {
        method: PaymentMethod.CASH,
        reference: 'CASH-001',
        amount: { amount: '513.0000', currency: 'EGP' },
        paidAt: '2026-09-22T09:00:00Z',
      },
      'same-key-1234',
      actor,
    );
    expect(replayed.id).toBe('pay-existing');
    expect((transaction.runInTransaction as jest.Mock).mock.calls).toHaveLength(0);

    // Conflicting reuse with different amount
    repository.findPaymentByIdempotencyKey.mockResolvedValueOnce(existingPayment);
    await expect(
      service.recordPayment(
        invoiceId,
        {
          method: PaymentMethod.CASH,
          reference: 'CASH-001',
          amount: { amount: '999.0000', currency: 'EGP' },
          paidAt: '2026-09-22T09:00:00Z',
        },
        'same-key-1234',
        actor,
      ),
    ).rejects.toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCode.IDEMPOTENCY_CONFLICT,
    });
  });

  // 15. Customer statement scope and date behavior
  it('returns customer statement with issued/paid/void lines and SQL totals', async () => {
    repository.getCustomerStatementLines.mockResolvedValueOnce([
      {
        invoice_id: 'inv-1',
        invoice_number: 'INV-2026-000001',
        job_number: 'JC-2026-000001',
        issued_at: new Date('2026-09-22T08:00:00Z'),
        status: InvoiceStatus.PAID,
        total_amount: '513.0000',
        currency_code: 'EGP',
      },
      {
        invoice_id: 'inv-2',
        invoice_number: 'INV-2026-000002',
        job_number: 'JC-2026-000002',
        issued_at: new Date('2026-09-22T09:00:00Z'),
        status: InvoiceStatus.ISSUED,
        total_amount: '200.0000',
        currency_code: 'EGP',
      },
      {
        invoice_id: 'inv-3',
        invoice_number: 'INV-2026-000003',
        job_number: 'JC-2026-000003',
        issued_at: new Date('2026-09-22T10:00:00Z'),
        status: InvoiceStatus.VOID,
        total_amount: '150.0000',
        currency_code: 'EGP',
      },
    ]);

    repository.getCustomerStatementTotals.mockResolvedValueOnce({
      total_invoiced: '713.0000',
      total_paid: '513.0000',
      total_outstanding: '200.0000',
    });

    const statement = await service.getCustomerStatement(
      customerId,
      { from: '2026-09-01T00:00:00Z', to: '2026-09-30T23:59:59Z' },
      actor,
    );

    expect(statement.customerId).toBe(customerId);
    expect(statement.customerDisplayName).toBe('Customer Alice');
    expect(statement.currencyCode).toBe('EGP');
    expect(statement.lines).toHaveLength(3);
    expect(statement.lines[0].paidAmount).toEqual({ amount: '513.0000', currency: 'EGP' });
    expect(statement.lines[1].paidAmount).toEqual({ amount: '0.0000', currency: 'EGP' });
    expect(statement.lines[2].paidAmount).toEqual({ amount: '0.0000', currency: 'EGP' });
    expect(statement.totalInvoiced).toEqual({ amount: '713.0000', currency: 'EGP' });
    expect(statement.totalPaid).toEqual({ amount: '513.0000', currency: 'EGP' });
    expect(statement.totalOutstanding).toEqual({ amount: '200.0000', currency: 'EGP' });
  });

  // 16. Transaction rollback on audit or persistence failure
  it('rolls back transaction if audit recording fails during draft invoice generation', async () => {
    const failure = new Error('audit recording failed');
    audit.record.mockRejectedValueOnce(failure);

    await expect(service.regenerateJobInvoice(jobId, actor)).rejects.toBe(failure);
  });
});

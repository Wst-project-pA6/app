import 'reflect-metadata';
import { DatabaseService } from '../../common/database/database.service';
import { DiscountType, PaymentMethod } from './dto/invoice.dto';
import { InvoicesRepository } from './invoices.repository';

describe('InvoicesRepository', () => {
  let repository: InvoicesRepository;
  let dbMock: { query: jest.Mock };
  let clientMock: { query: jest.Mock };

  beforeEach(() => {
    dbMock = { query: jest.fn() };
    clientMock = { query: jest.fn() };
    repository = new InvoicesRepository(dbMock as unknown as DatabaseService);
  });

  afterEach(() => jest.clearAllMocks());

  it('reads finance settings from singleton row', async () => {
    const row = {
      currency_code: 'EGP',
      labor_hourly_rate: '150.0000',
      tax_rate_percent: '14.000',
      tax_label: 'VAT',
    };
    dbMock.query.mockResolvedValue({ rows: [row] });

    const result = await repository.getFinanceSettings();
    expect(result).toEqual(row);
    expect(dbMock.query.mock.calls[0][0]).toContain('FROM finance_settings WHERE id = TRUE');
  });

  it('calculates job summary totals using SQL monetary aggregation and rounding', async () => {
    const summaryRow = {
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
    };
    dbMock.query.mockResolvedValue({ rows: [summaryRow] });

    const jobId = '11111111-1111-4111-8111-111111111111';
    const result = await repository.calculateJobSummaryTotals(null, jobId);

    expect(result).toEqual(summaryRow);
    const sql = dbMock.query.mock.calls[0][0];
    expect(sql).toContain('ROUND(c.subtotal * c.tax_rate_percent / 100.0, 4)');
    expect(sql).toContain('ROUND((quantity - reversed_quantity)::numeric * unit_price_amount, 4)');
  });

  it('retrieves summary lines for active labor, net parts and active sublet', async () => {
    const laborLine = {
      sourceId: 'labor-1',
      lineType: 'LABOR',
      sourceType: 'LABOR_ENTRY',
      description: 'Brake inspection',
      quantity: '1.5000',
      unitPriceAmount: '150.0000',
      unitPriceCurrency: 'EGP',
      lineTotalAmount: '225.0000',
      lineTotalCurrency: 'EGP',
    };
    const partLine = {
      sourceId: 'part-issue-1',
      lineType: 'PART',
      sourceType: 'PART_ISSUE',
      description: 'Brake pads',
      quantity: '2.0000',
      unitPriceAmount: '50.0000',
      unitPriceCurrency: 'EGP',
      lineTotalAmount: '100.0000',
      lineTotalCurrency: 'EGP',
    };
    const subletLine = {
      sourceId: 'sublet-1',
      lineType: 'SUBLET',
      sourceType: 'SUBLET_ENTRY',
      description: 'Rotor skimming',
      quantity: '1.0000',
      unitPriceAmount: '75.0000',
      unitPriceCurrency: 'EGP',
      lineTotalAmount: '75.0000',
      lineTotalCurrency: 'EGP',
    };

    dbMock.query
      .mockResolvedValueOnce({ rows: [laborLine] })
      .mockResolvedValueOnce({ rows: [partLine] })
      .mockResolvedValueOnce({ rows: [subletLine] });

    const jobId = '11111111-1111-4111-8111-111111111111';
    const lines = await repository.getSummaryLines(null, jobId);

    expect(lines).toHaveLength(3);
    expect(lines[0].description).toBe('Brake inspection');
    expect(lines[1].description).toBe('Brake pads');
    expect(lines[2].description).toBe('Rotor skimming');
  });

  it('creates a draft invoice and persists traceable invoice lines atomically', async () => {
    clientMock.query
      .mockResolvedValueOnce({ rows: [{ id: 'inv-new' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });

    const jobId = '11111111-1111-4111-8111-111111111111';
    const customerId = '22222222-2222-4222-8222-222222222222';
    const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    const invoiceId = await repository.createDraftInvoice(
      clientMock as never,
      jobId,
      customerId,
      actorId,
    );

    expect(invoiceId).toBe('inv-new');
    expect(clientMock.query).toHaveBeenCalledTimes(4);
    expect(clientMock.query.mock.calls[0][0]).toContain("status, currency_code");
    expect(clientMock.query.mock.calls[1][0]).toContain("'LABOR_ENTRY'");
    expect(clientMock.query.mock.calls[2][0]).toContain("'PART_ISSUE'");
    expect(clientMock.query.mock.calls[3][0]).toContain("'SUBLET_ENTRY'");
  });

  it('updates draft invoice discount and recalculates totals in SQL', async () => {
    const updatedRow = {
      id: 'inv-1',
      version: 2,
      discount_type: 'PERCENT',
      discount_value: '10.0000',
      discount_total: '45.0000',
      taxable_amount: '405.0000',
      tax_amount: '56.7000',
      total_amount: '461.7000',
    };
    clientMock.query.mockResolvedValue({ rows: [updatedRow] });

    const result = await repository.updateDraftInvoice(
      clientMock as never,
      'inv-1',
      1,
      {
        hasDiscount: true,
        discountType: DiscountType.PERCENT,
        discountValue: '10.0000',
        discountReason: 'Loyalty',
        discountTotal: '45.0000',
        notes: 'Updated notes',
      },
      'actor-1',
    );

    expect(result).toEqual(updatedRow);
    const sql = clientMock.query.mock.calls[0][0];
    expect(sql).toContain('UPDATE invoices i');
    expect(sql).toContain('version = i.version + 1');
  });

  it('transitions draft invoice to ISSUED with sequence and UTC year format', async () => {
    const issuedRow = {
      id: 'inv-1',
      status: 'ISSUED',
      invoice_number: 'INV-2026-000001',
      version: 2,
    };
    clientMock.query.mockResolvedValue({ rows: [issuedRow] });

    const result = await repository.transitionToIssued(
      clientMock as never,
      'inv-1',
      'actor-1',
    );

    expect(result).toEqual(issuedRow);
    const sql = clientMock.query.mock.calls[0][0];
    expect(sql).toContain("nextval('invoice_number_seq')");
    expect(sql).toContain("to_char(NOW() AT TIME ZONE 'UTC', 'YYYY')");
    expect(sql).toContain("'INV-' || s.yr || '-' || LPAD(s.num::text, 6, '0')");
  });

  it('transitions issued invoice to VOID with nonblank reason', async () => {
    const voidedRow = {
      id: 'inv-1',
      status: 'VOID',
      void_reason: 'Incorrect billing items',
      version: 3,
    };
    clientMock.query.mockResolvedValue({ rows: [voidedRow] });

    const result = await repository.transitionToVoid(
      clientMock as never,
      'inv-1',
      'Incorrect billing items',
      'actor-1',
    );

    expect(result).toEqual(voidedRow);
    const sql = clientMock.query.mock.calls[0][0];
    expect(sql).toContain("status = 'VOID'");
  });

  it('records payment and marks invoice PAID atomically', async () => {
    const paymentRef = {
      id: 'payment-1',
      invoice_id: 'inv-1',
      method: 'CASH',
      amount_amount: '513.0000',
      amount_currency: 'EGP',
    };
    clientMock.query
      .mockResolvedValueOnce({ rows: [paymentRef] })
      .mockResolvedValueOnce({ rowCount: 1 });

    const result = await repository.recordPayment(
      clientMock as never,
      'inv-1',
      {
        method: PaymentMethod.CASH,
        reference: 'CASH-RECEIPT-001',
        amountAmount: '513.0000',
        amountCurrency: 'EGP',
        paidAt: '2026-09-22T10:00:00Z',
        idempotencyKey: 'key-12345678',
      },
      'actor-1',
    );

    expect(result).toEqual(paymentRef);
    expect(clientMock.query).toHaveBeenCalledTimes(2);
    expect(clientMock.query.mock.calls[0][0]).toContain('INSERT INTO payment_references');
    expect(clientMock.query.mock.calls[1][0]).toContain("status = 'PAID'");
  });

  it('queries customer statement lines and statement totals in SQL', async () => {
    const statementLine = {
      invoice_id: 'inv-1',
      invoice_number: 'INV-2026-000001',
      job_number: 'JC-2026-000001',
      issued_at: new Date('2026-09-22T08:00:00Z'),
      status: 'ISSUED',
      total_amount: '500.0000',
      currency_code: 'EGP',
    };
    const statementTotals = {
      total_invoiced: '500.0000',
      total_paid: '0.0000',
      total_outstanding: '500.0000',
    };

    dbMock.query
      .mockResolvedValueOnce({ rows: [statementLine] })
      .mockResolvedValueOnce({ rows: [statementTotals] });

    const lines = await repository.getCustomerStatementLines(null, 'cust-1');
    const totals = await repository.getCustomerStatementTotals(null, 'cust-1');

    expect(lines).toHaveLength(1);
    expect(lines[0].invoice_number).toBe('INV-2026-000001');
    expect(totals.total_invoiced).toBe('500.0000');
    expect(totals.total_outstanding).toBe('500.0000');
  });
});

import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  CustomerStatementDto,
  CustomerStatementQueryDto,
  DiscountDto,
  DiscountType,
  InvoiceDto,
  InvoiceLineDto,
  InvoiceListQuery,
  InvoicePageDto,
  InvoiceStatus,
  InvoiceSummaryDto,
  InvoiceTotalsDto,
  InvoiceTransitionRequestDto,
  InvoiceUpdateRequestDto,
  PaymentCreateRequestDto,
  PaymentReferenceDto,
  StatementLineDto,
} from './dto/invoice.dto';
import {
  InvoiceLineRow,
  InvoiceRowWithJob,
  InvoicesRepository,
  PaymentReferenceRow,
} from './invoices.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const validationFailed = (field: string, code: string, message: string): AppError =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED, 'Validation failed', [
    { field, code, message },
  ]);

const ALLOWED_SORT_FIELDS = new Set(['invoiceNumber', 'createdAt', 'issuedAt', 'total']);

@Injectable()
export class InvoicesService {
  constructor(
    private readonly repository: InvoicesRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async getJobInvoiceSummary(
    jobId: string,
    actor: AuthenticatedPrincipal,
  ): Promise<InvoiceSummaryDto> {
    const job = await this.repository.findJobForInvoice(null, jobId, false);
    if (!job || !this.scopeService.hasScope(actor, job.organization_scope_id)) {
      throw notFound();
    }

    const finance = await this.repository.getFinanceSettings();
    if (!finance) {
      throw new AppError(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ErrorCode.INTERNAL_ERROR,
        'Finance settings not configured',
      );
    }

    const currencyCode = finance.currency_code.trim();
    const isConsistent = await this.repository.checkCurrencyConsistency(
      null,
      jobId,
      currencyCode,
    );
    if (!isConsistent) {
      throw new AppError(
        HttpStatus.CONFLICT,
        ErrorCode.INVALID_STATE_TRANSITION,
        'Inconsistent currency across job items',
      );
    }

    const [totals, lines] = await Promise.all([
      this.repository.calculateJobSummaryTotals(null, jobId),
      this.repository.getSummaryLines(null, jobId),
    ]);

    const mappedLines: InvoiceLineDto[] = lines.map((l) => ({
      id: l.id,
      lineType: l.lineType,
      description: l.description,
      quantity: l.quantity,
      unitPrice: { amount: l.unitPriceAmount, currency: l.unitPriceCurrency },
      lineTotal: { amount: l.lineTotalAmount, currency: l.lineTotalCurrency },
      sourceType: l.sourceType,
      sourceId: l.sourceId,
    }));

    const mappedTotals: InvoiceTotalsDto = {
      laborSubtotal: { amount: totals.labor_subtotal, currency: currencyCode },
      partsSubtotal: { amount: totals.parts_subtotal, currency: currencyCode },
      subletSubtotal: { amount: totals.sublet_subtotal, currency: currencyCode },
      subtotal: { amount: totals.subtotal, currency: currencyCode },
      discountTotal: { amount: totals.discount_total, currency: currencyCode },
      taxableAmount: { amount: totals.taxable_amount, currency: currencyCode },
      taxRatePercent: totals.tax_rate_percent,
      taxAmount: { amount: totals.tax_amount, currency: currencyCode },
      total: { amount: totals.total_amount, currency: currencyCode },
    };

    return {
      jobId: job.id,
      jobStage: job.stage,
      currencyCode,
      lines: mappedLines,
      totals: mappedTotals,
      calculatedAt: new Date().toISOString(),
    };
  }

  async regenerateJobInvoice(
    jobId: string,
    actor: AuthenticatedPrincipal,
  ): Promise<InvoiceDto> {
    return this.transaction.runInTransaction(async (client) => {
      const job = await this.repository.findJobForInvoice(client, jobId, true);
      if (!job || !this.scopeService.hasScope(actor, job.organization_scope_id)) {
        throw notFound();
      }

      if (job.stage !== 'READY') {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.JOB_STAGE_NOT_ALLOWED,
          'Job stage must be READY to create an invoice',
        );
      }

      const existingNonVoid = await this.repository.findNonVoidInvoiceForJob(client, jobId, true);
      if (existingNonVoid) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.DUPLICATE_RESOURCE,
          'A non-void invoice already exists for this job',
        );
      }

      const finance = await this.repository.getFinanceSettings(client);
      if (!finance) {
        throw new AppError(
          HttpStatus.INTERNAL_SERVER_ERROR,
          ErrorCode.INTERNAL_ERROR,
          'Finance settings not configured',
        );
      }

      const isConsistent = await this.repository.checkCurrencyConsistency(
        client,
        jobId,
        finance.currency_code.trim(),
      );
      if (!isConsistent) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.INVALID_STATE_TRANSITION,
          'Inconsistent currency across job items',
        );
      }

      let invoiceId: string;
      try {
        invoiceId = await this.repository.createDraftInvoice(
          client,
          jobId,
          job.customer_id,
          actor.id,
        );
      } catch (err: unknown) {
        if ((err as { code?: string; constraint?: string })?.code === '23505') {
          throw new AppError(
            HttpStatus.CONFLICT,
            ErrorCode.DUPLICATE_RESOURCE,
            'A non-void invoice already exists for this job',
          );
        }
        throw err;
      }

      const invoice = await this.repository.findInvoiceById(client, invoiceId, false);
      if (!invoice) throw notFound();

      const [lines, payments] = await Promise.all([
        this.repository.findInvoiceLines(client, invoiceId),
        this.repository.findPaymentReferences(client, invoiceId),
      ]);

      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'INVOICE.CREATE',
        entityType: 'INVOICE',
        entityId: invoiceId,
        outcome: 'SUCCESS',
        summary: `DRAFT invoice created for job ${job.job_number}`,
      });

      return this.mapInvoice(invoice, lines, payments);
    });
  }

  async listInvoices(
    query: InvoiceListQuery,
    actor: AuthenticatedPrincipal,
  ): Promise<InvoicePageDto> {
    if (query.sort) {
      const field = query.sort.startsWith('-') ? query.sort.slice(1) : query.sort;
      if (!ALLOWED_SORT_FIELDS.has(field)) {
        throw badRequest('Invalid sort field');
      }
    }

    const scopeIds = this.scopeService.allowedScopeIds(actor);
    const { rows, total } = await this.repository.listInvoices(null, scopeIds, query);

    const items = await Promise.all(
      rows.map(async (row) => {
        const [lines, payments] = await Promise.all([
          this.repository.findInvoiceLines(null, row.id),
          this.repository.findPaymentReferences(null, row.id),
        ]);
        return this.mapInvoice(row, lines, payments);
      }),
    );

    const totalPages = Math.ceil(total / query.pageSize);
    return {
      items,
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages,
      },
    };
  }

  async getInvoice(
    invoiceId: string,
    actor: AuthenticatedPrincipal,
  ): Promise<InvoiceDto> {
    const invoice = await this.repository.findInvoiceById(null, invoiceId, false);
    if (!invoice || !this.scopeService.hasScope(actor, invoice.organization_scope_id)) {
      throw notFound();
    }

    const [lines, payments] = await Promise.all([
      this.repository.findInvoiceLines(null, invoiceId),
      this.repository.findPaymentReferences(null, invoiceId),
    ]);

    return this.mapInvoice(invoice, lines, payments);
  }

  async updateInvoice(
    invoiceId: string,
    dto: InvoiceUpdateRequestDto,
    actor: AuthenticatedPrincipal,
  ): Promise<InvoiceDto> {
    return this.transaction.runInTransaction(async (client) => {
      const invoice = await this.repository.findInvoiceById(client, invoiceId, true);
      if (!invoice || !this.scopeService.hasScope(actor, invoice.organization_scope_id)) {
        throw notFound();
      }

      if (invoice.status !== InvoiceStatus.DRAFT) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.INVALID_STATE_TRANSITION,
          'Only DRAFT invoices can be edited',
        );
      }

      if (invoice.version !== dto.version) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.VERSION_CONFLICT,
          'Version conflict',
        );
      }

      let hasDiscount = false;
      let discountType: DiscountType | null = null;
      let discountValue: string | null = null;
      let discountReason: string | null = null;
      let discountTotal: string | null = null;

      if (dto.discount !== undefined) {
        hasDiscount = true;
        if (dto.discount === null) {
          discountType = null;
          discountValue = null;
          discountReason = null;
          discountTotal = '0.0000';
        } else {
          const discountValNum = parseFloat(dto.discount.value);
          if (isNaN(discountValNum) || discountValNum < 0) {
            throw validationFailed('discount.value', 'INVALID_VALUE', 'Discount value must be non-negative');
          }
          if (dto.discount.type === DiscountType.PERCENT && discountValNum > 100) {
            throw validationFailed('discount.value', 'INVALID_VALUE', 'Percentage discount cannot exceed 100');
          }

          const calc = await this.repository.calculateDiscountTotal(
            client,
            invoice.subtotal,
            dto.discount.type,
            dto.discount.value,
          );

          if (calc.isNegative) {
            throw validationFailed('discount.value', 'DISCOUNT_EXCEEDS_SUBTOTAL', 'Discount cannot exceed subtotal');
          }

          discountType = dto.discount.type;
          discountValue = dto.discount.value;
          discountReason = dto.discount.reason;
          discountTotal = calc.discountTotal;
        }
      }

      const updated = await this.repository.updateDraftInvoice(
        client,
        invoiceId,
        dto.version,
        {
          hasDiscount,
          discountType,
          discountValue,
          discountReason,
          discountTotal,
          notes: dto.notes,
        },
        actor.id,
      );

      if (!updated) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.VERSION_CONFLICT,
          'Version conflict',
        );
      }

      const [lines, payments] = await Promise.all([
        this.repository.findInvoiceLines(client, invoiceId),
        this.repository.findPaymentReferences(client, invoiceId),
      ]);

      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'INVOICE.UPDATE',
        entityType: 'INVOICE',
        entityId: invoiceId,
        outcome: 'SUCCESS',
        summary: `DRAFT invoice ${invoiceId} updated`,
      });

      const updatedWithJob: InvoiceRowWithJob = {
        ...updated,
        organization_scope_id: invoice.organization_scope_id,
        job_number: invoice.job_number,
      };

      return this.mapInvoice(updatedWithJob, lines, payments);
    });
  }

  async transitionInvoice(
    invoiceId: string,
    dto: InvoiceTransitionRequestDto,
    actor: AuthenticatedPrincipal,
  ): Promise<InvoiceDto> {
    return this.transaction.runInTransaction(async (client) => {
      const invoice = await this.repository.findInvoiceById(client, invoiceId, true);
      if (!invoice || !this.scopeService.hasScope(actor, invoice.organization_scope_id)) {
        throw notFound();
      }

      if (invoice.status === InvoiceStatus.PAID) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.INVALID_STATE_TRANSITION,
          'PAID invoices cannot be transitioned',
        );
      }

      let updatedRow: InvoiceRowWithJob | null = null;

      if (dto.toStatus === 'ISSUED') {
        if (invoice.status !== InvoiceStatus.DRAFT) {
          throw new AppError(
            HttpStatus.CONFLICT,
            ErrorCode.INVALID_STATE_TRANSITION,
            'Only DRAFT invoices can be issued',
          );
        }

        const issued = await this.repository.transitionToIssued(client, invoiceId, actor.id);
        if (!issued) {
          throw new AppError(
            HttpStatus.CONFLICT,
            ErrorCode.INVALID_STATE_TRANSITION,
            'Invoice could not be transitioned to ISSUED',
          );
        }

        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'INVOICE.TRANSITION',
          entityType: 'INVOICE',
          entityId: invoiceId,
          outcome: 'SUCCESS',
          summary: `DRAFT -> ISSUED: ${issued.invoice_number}`,
        });

        updatedRow = {
          ...issued,
          organization_scope_id: invoice.organization_scope_id,
          job_number: invoice.job_number,
        };
      } else if (dto.toStatus === 'VOID') {
        if (invoice.status !== InvoiceStatus.ISSUED) {
          throw new AppError(
            HttpStatus.CONFLICT,
            ErrorCode.INVALID_STATE_TRANSITION,
            'Only ISSUED invoices can be voided',
          );
        }

        if (!dto.reason || dto.reason.trim().length < 3) {
          throw validationFailed('reason', 'REQUIRED', 'Reason is required when voiding an invoice');
        }

        const voided = await this.repository.transitionToVoid(
          client,
          invoiceId,
          dto.reason.trim(),
          actor.id,
        );
        if (!voided) {
          throw new AppError(
            HttpStatus.CONFLICT,
            ErrorCode.INVALID_STATE_TRANSITION,
            'Invoice could not be transitioned to VOID',
          );
        }

        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'INVOICE.TRANSITION',
          entityType: 'INVOICE',
          entityId: invoiceId,
          outcome: 'SUCCESS',
          summary: `ISSUED -> VOID: ${dto.reason.trim()}`,
        });

        updatedRow = {
          ...voided,
          organization_scope_id: invoice.organization_scope_id,
          job_number: invoice.job_number,
        };
      } else {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.INVALID_STATE_TRANSITION,
          'Invalid state transition',
        );
      }

      const [lines, payments] = await Promise.all([
        this.repository.findInvoiceLines(client, invoiceId),
        this.repository.findPaymentReferences(client, invoiceId),
      ]);

      return this.mapInvoice(updatedRow, lines, payments);
    });
  }

  async recordPayment(
    invoiceId: string,
    dto: PaymentCreateRequestDto,
    idempotencyKey: string | undefined,
    actor: AuthenticatedPrincipal,
  ): Promise<PaymentReferenceDto> {
    if (idempotencyKey !== undefined) {
      if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
        throw badRequest('Idempotency-Key must be between 8 and 128 characters');
      }

      const existing = await this.repository.findPaymentByIdempotencyKey(null, idempotencyKey);
      if (existing) {
        if (!this.scopeService.hasScope(actor, existing.organization_scope_id)) {
          throw notFound();
        }

        const isMatch =
          existing.invoice_id === invoiceId &&
          existing.method === dto.method &&
          existing.reference === dto.reference &&
          existing.amount_currency.trim() === dto.amount.currency.trim() &&
          parseFloat(existing.amount_amount) === parseFloat(dto.amount.amount);

        if (isMatch) {
          return this.mapPaymentReference(existing);
        }

        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.IDEMPOTENCY_CONFLICT,
          'Idempotency key conflict',
        );
      }
    }

    return this.transaction.runInTransaction(async (client) => {
      const invoice = await this.repository.findInvoiceById(client, invoiceId, true);
      if (!invoice || !this.scopeService.hasScope(actor, invoice.organization_scope_id)) {
        throw notFound();
      }

      if (invoice.status !== InvoiceStatus.ISSUED) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.INVALID_STATE_TRANSITION,
          'Invoice must be in ISSUED status to receive payment',
        );
      }

      if (dto.amount.currency.trim() !== invoice.currency_code.trim()) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.PAYMENT_AMOUNT_MISMATCH,
          'Payment currency does not match invoice currency',
        );
      }

      const isExactAmount = await this.repository.checkAmountsMatch(
        client,
        dto.amount.amount,
        invoice.total_amount,
      );
      if (!isExactAmount) {
        throw new AppError(
          HttpStatus.CONFLICT,
          ErrorCode.PAYMENT_AMOUNT_MISMATCH,
          'Payment amount must equal invoice total',
        );
      }

      let paymentRef: PaymentReferenceRow;
      try {
        paymentRef = await this.repository.recordPayment(
          client,
          invoiceId,
          {
            method: dto.method,
            reference: dto.reference,
            amountAmount: dto.amount.amount,
            amountCurrency: dto.amount.currency.trim(),
            paidAt: dto.paidAt,
            idempotencyKey: idempotencyKey ?? null,
          },
          actor.id,
        );
      } catch (err: unknown) {
        if ((err as { code?: string; constraint?: string })?.code === '23505') {
          throw new AppError(
            HttpStatus.CONFLICT,
            ErrorCode.IDEMPOTENCY_CONFLICT,
            'Idempotency key conflict',
          );
        }
        throw err;
      }

      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'PAYMENT.RECORD',
        entityType: 'PAYMENT_REFERENCE',
        entityId: paymentRef.id,
        outcome: 'SUCCESS',
        summary: `Payment recorded for invoice ${invoice.invoice_number ?? invoiceId}`,
      });

      return this.mapPaymentReference(paymentRef);
    });
  }

  async getCustomerStatement(
    customerId: string,
    query: CustomerStatementQueryDto,
    actor: AuthenticatedPrincipal,
  ): Promise<CustomerStatementDto> {
    const customer = await this.repository.findCustomerForStatement(null, customerId);
    if (!customer || !this.scopeService.hasScope(actor, customer.organization_scope_id)) {
      throw notFound();
    }

    const finance = await this.repository.getFinanceSettings();
    const currencyCode = finance?.currency_code.trim() ?? 'EGP';

    const [lines, totals] = await Promise.all([
      this.repository.getCustomerStatementLines(null, customerId, query.from, query.to),
      this.repository.getCustomerStatementTotals(null, customerId, query.from, query.to),
    ]);

    const mappedLines: StatementLineDto[] = lines.map((l) => ({
      invoiceId: l.invoice_id,
      ...(l.invoice_number ? { invoiceNumber: l.invoice_number } : {}),
      jobNumber: l.job_number,
      ...(l.issued_at ? { issuedAt: l.issued_at.toISOString() } : {}),
      status: l.status,
      total: { amount: l.total_amount, currency: l.currency_code.trim() },
      paidAmount: {
        amount: l.status === InvoiceStatus.PAID ? l.total_amount : '0.0000',
        currency: l.currency_code.trim(),
      },
    }));

    return {
      customerId: customer.id,
      customerDisplayName: customer.display_name,
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      currencyCode,
      lines: mappedLines,
      totalInvoiced: { amount: totals.total_invoiced, currency: currencyCode },
      totalPaid: { amount: totals.total_paid, currency: currencyCode },
      totalOutstanding: { amount: totals.total_outstanding, currency: currencyCode },
      generatedAt: new Date().toISOString(),
    };
  }

  private mapInvoice(
    row: InvoiceRowWithJob,
    lines: InvoiceLineRow[],
    payments: PaymentReferenceRow[],
  ): InvoiceDto {
    const currency = row.currency_code.trim();

    let discount: DiscountDto | undefined;
    if (row.discount_type && row.discount_value && row.discount_reason) {
      discount = {
        type: row.discount_type,
        value: row.discount_value,
        reason: row.discount_reason,
      };
    }

    const totals: InvoiceTotalsDto = {
      laborSubtotal: { amount: row.labor_subtotal, currency },
      partsSubtotal: { amount: row.parts_subtotal, currency },
      subletSubtotal: { amount: row.sublet_subtotal, currency },
      subtotal: { amount: row.subtotal, currency },
      discountTotal: { amount: row.discount_total, currency },
      taxableAmount: { amount: row.taxable_amount, currency },
      taxRatePercent: row.tax_rate_percent,
      taxAmount: { amount: row.tax_amount, currency },
      total: { amount: row.total_amount, currency },
    };

    const mappedLines: InvoiceLineDto[] = lines.map((l) => ({
      id: l.id,
      lineType: l.line_type,
      description: l.description,
      quantity: l.quantity,
      unitPrice: {
        amount: l.unit_price_amount,
        currency: l.unit_price_currency.trim(),
      },
      lineTotal: {
        amount: l.line_total_amount,
        currency: l.line_total_currency.trim(),
      },
      sourceType: l.source_type,
      sourceId:
        l.source_labor_entry_id ??
        l.source_part_issue_id ??
        l.source_sublet_entry_id ??
        l.id,
    }));

    const mappedPayments: PaymentReferenceDto[] = payments.map((p) =>
      this.mapPaymentReference(p),
    );

    return {
      id: row.id,
      ...(row.invoice_number ? { invoiceNumber: row.invoice_number } : {}),
      jobId: row.job_id,
      jobNumber: row.job_number,
      customerId: row.customer_id,
      status: row.status,
      currencyCode: currency,
      lines: mappedLines,
      ...(discount ? { discount } : {}),
      totals,
      payments: mappedPayments,
      ...(row.notes ? { notes: row.notes } : {}),
      ...(row.issued_at ? { issuedAt: row.issued_at.toISOString() } : {}),
      ...(row.paid_at ? { paidAt: row.paid_at.toISOString() } : {}),
      ...(row.void_reason ? { voidReason: row.void_reason } : {}),
      version: row.version,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      createdBy: row.created_by,
      updatedBy: row.updated_by,
    };
  }

  private mapPaymentReference(row: PaymentReferenceRow): PaymentReferenceDto {
    return {
      id: row.id,
      invoiceId: row.invoice_id,
      method: row.method,
      reference: row.reference,
      amount: {
        amount: row.amount_amount,
        currency: row.amount_currency.trim(),
      },
      paidAt: row.paid_at.toISOString(),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.created_at.toISOString(),
      createdBy: row.created_by,
      updatedBy: row.created_by,
    };
  }
}

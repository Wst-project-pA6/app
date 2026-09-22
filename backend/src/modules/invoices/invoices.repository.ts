import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import {
  DiscountType,
  InvoiceLineType,
  InvoiceListQuery,
  InvoiceSourceType,
  InvoiceStatus,
  PaymentMethod,
} from './dto/invoice.dto';

export interface FinanceSettingsRow {
  currency_code: string;
  labor_hourly_rate: string;
  tax_rate_percent: string;
  tax_label: string;
}

export interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  job_id: string;
  customer_id: string;
  status: InvoiceStatus;
  currency_code: string;
  discount_type: DiscountType | null;
  discount_value: string | null;
  discount_reason: string | null;
  labor_subtotal: string;
  parts_subtotal: string;
  sublet_subtotal: string;
  subtotal: string;
  discount_total: string;
  taxable_amount: string;
  tax_rate_percent: string;
  tax_amount: string;
  total_amount: string;
  notes: string | null;
  issued_at: Date | null;
  paid_at: Date | null;
  void_reason: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface InvoiceRowWithJob extends InvoiceRow {
  organization_scope_id: string;
  job_number: string;
}

export interface InvoiceLineRow {
  id: string;
  invoice_id: string;
  line_type: InvoiceLineType;
  description: string;
  quantity: string;
  unit_price_amount: string;
  unit_price_currency: string;
  line_total_amount: string;
  line_total_currency: string;
  source_type: InvoiceSourceType;
  source_labor_entry_id: string | null;
  source_part_issue_id: string | null;
  source_sublet_entry_id: string | null;
}

export interface PaymentReferenceRow {
  id: string;
  invoice_id: string;
  method: PaymentMethod;
  reference: string;
  amount_amount: string;
  amount_currency: string;
  paid_at: Date;
  idempotency_key: string | null;
  created_at: Date;
  created_by: string | null;
}

export interface JobHeaderRow {
  id: string;
  organization_scope_id: string;
  customer_id: string;
  stage: string;
  job_number: string;
}

export interface CalculatedSummaryTotals {
  labor_subtotal: string;
  parts_subtotal: string;
  sublet_subtotal: string;
  subtotal: string;
  discount_total: string;
  taxable_amount: string;
  tax_rate_percent: string;
  tax_amount: string;
  total_amount: string;
  currency_code: string;
}

export interface CustomerRowForStatement {
  id: string;
  organization_scope_id: string;
  display_name: string;
}

export interface StatementLineRow {
  invoice_id: string;
  invoice_number: string | null;
  job_number: string;
  issued_at: Date | null;
  status: InvoiceStatus;
  total_amount: string;
  currency_code: string;
}

export interface StatementTotalsRow {
  total_invoiced: string;
  total_paid: string;
  total_outstanding: string;
}

@Injectable()
export class InvoicesRepository {
  constructor(private readonly db: DatabaseService) {}

  async getFinanceSettings(client?: PoolClient): Promise<FinanceSettingsRow | null> {
    const sql = `SELECT currency_code, labor_hourly_rate, tax_rate_percent, tax_label
                 FROM finance_settings WHERE id = TRUE`;
    const result = client
      ? await client.query<FinanceSettingsRow>(sql)
      : await this.db.query<FinanceSettingsRow>(sql);
    return result.rows[0] ?? null;
  }

  async findJobForInvoice(
    client: PoolClient | null,
    jobId: string,
    lock = false,
  ): Promise<JobHeaderRow | null> {
    const sql = `SELECT id, organization_scope_id, customer_id, stage, job_number
                 FROM job_cards
                 WHERE id = $1
                 ${lock ? 'FOR UPDATE' : ''}`;
    const result = client
      ? await client.query<JobHeaderRow>(sql, [jobId])
      : await this.db.query<JobHeaderRow>(sql, [jobId]);
    return result.rows[0] ?? null;
  }

  async findNonVoidInvoiceForJob(
    client: PoolClient | null,
    jobId: string,
    lock = false,
  ): Promise<{ id: string; status: InvoiceStatus; version: number } | null> {
    const sql = `SELECT id, status, version
                 FROM invoices
                 WHERE job_id = $1 AND status <> 'VOID'
                 ${lock ? 'FOR UPDATE' : ''}
                 LIMIT 1`;
    const result = client
      ? await client.query<{ id: string; status: InvoiceStatus; version: number }>(sql, [jobId])
      : await this.db.query<{ id: string; status: InvoiceStatus; version: number }>(sql, [jobId]);
    return result.rows[0] ?? null;
  }

  async calculateJobSummaryTotals(
    client: PoolClient | null,
    jobId: string,
  ): Promise<CalculatedSummaryTotals> {
    const sql = `
      WITH totals AS (
        SELECT
          COALESCE((SELECT SUM(amount) FROM labor_entries WHERE job_id = $1 AND status = 'ACTIVE'), 0.0000) AS labor_subtotal,
          COALESCE((SELECT SUM(ROUND((quantity - reversed_quantity)::numeric * unit_price_amount, 4))
                    FROM part_issues WHERE job_id = $1 AND (quantity - reversed_quantity) > 0), 0.0000) AS parts_subtotal,
          COALESCE((SELECT SUM(cost_amount) FROM sublet_entries WHERE job_id = $1 AND status = 'ACTIVE'), 0.0000) AS sublet_subtotal
      ),
      calc AS (
        SELECT
          t.labor_subtotal, t.parts_subtotal, t.sublet_subtotal,
          (t.labor_subtotal + t.parts_subtotal + t.sublet_subtotal) AS subtotal,
          fs.currency_code, fs.tax_rate_percent
        FROM totals t, finance_settings fs WHERE fs.id = TRUE
      )
      SELECT
        c.labor_subtotal::text,
        c.parts_subtotal::text,
        c.sublet_subtotal::text,
        c.subtotal::text,
        '0.0000' AS discount_total,
        c.subtotal::text AS taxable_amount,
        c.tax_rate_percent::text,
        ROUND(c.subtotal * c.tax_rate_percent / 100.0, 4)::text AS tax_amount,
        (c.subtotal + ROUND(c.subtotal * c.tax_rate_percent / 100.0, 4))::text AS total_amount,
        c.currency_code
      FROM calc c`;
    const result = client
      ? await client.query<CalculatedSummaryTotals>(sql, [jobId])
      : await this.db.query<CalculatedSummaryTotals>(sql, [jobId]);
    return result.rows[0];
  }

  async getSummaryLines(
    client: PoolClient | null,
    jobId: string,
  ): Promise<
    Array<{
      id: string;
      lineType: InvoiceLineType;
      description: string;
      quantity: string;
      unitPriceAmount: string;
      unitPriceCurrency: string;
      lineTotalAmount: string;
      lineTotalCurrency: string;
      sourceType: InvoiceSourceType;
      sourceId: string;
    }>
  > {
    const laborSql = `
      SELECT
        le.id AS "sourceId",
        'LABOR' AS "lineType",
        'LABOR_ENTRY' AS "sourceType",
        COALESCE(le.description, 'Labor') AS description,
        ROUND(le.duration_minutes::numeric / 60.0, 4)::text AS quantity,
        le.hourly_rate_amount::text AS "unitPriceAmount",
        le.hourly_rate_currency AS "unitPriceCurrency",
        le.amount::text AS "lineTotalAmount",
        le.amount_currency AS "lineTotalCurrency"
      FROM labor_entries le
      WHERE le.job_id = $1 AND le.status = 'ACTIVE'
      ORDER BY le.created_at ASC, le.id ASC`;

    const partsSql = `
      SELECT
        pi.id AS "sourceId",
        'PART' AS "lineType",
        'PART_ISSUE' AS "sourceType",
        COALESCE(p.name_en, pi.part_sku) AS description,
        (pi.quantity - pi.reversed_quantity)::numeric(14,4)::text AS quantity,
        pi.unit_price_amount::text AS "unitPriceAmount",
        pi.unit_price_currency AS "unitPriceCurrency",
        ROUND((pi.quantity - pi.reversed_quantity)::numeric * pi.unit_price_amount, 4)::text AS "lineTotalAmount",
        pi.line_total_currency AS "lineTotalCurrency"
      FROM part_issues pi
      JOIN parts p ON p.id = pi.part_id
      WHERE pi.job_id = $1 AND (pi.quantity - pi.reversed_quantity) > 0
      ORDER BY pi.created_at ASC, pi.id ASC`;

    const subletSql = `
      SELECT
        se.id AS "sourceId",
        'SUBLET' AS "lineType",
        'SUBLET_ENTRY' AS "sourceType",
        se.description,
        '1.0000' AS quantity,
        se.cost_amount::text AS "unitPriceAmount",
        se.cost_currency AS "unitPriceCurrency",
        se.cost_amount::text AS "lineTotalAmount",
        se.cost_currency AS "lineTotalCurrency"
      FROM sublet_entries se
      WHERE se.job_id = $1 AND se.status = 'ACTIVE'
      ORDER BY se.created_at ASC, se.id ASC`;

    const runQuery = async (sql: string) => {
      return client ? (await client.query(sql, [jobId])).rows : (await this.db.query(sql, [jobId])).rows;
    };

    const [laborRows, partRows, subletRows] = await Promise.all([
      runQuery(laborSql),
      runQuery(partsSql),
      runQuery(subletSql),
    ]);

    const all = [...laborRows, ...partRows, ...subletRows];
    return all.map((r) => ({
      id: r.sourceId,
      lineType: r.lineType as InvoiceLineType,
      description: r.description,
      quantity: r.quantity,
      unitPriceAmount: r.unitPriceAmount,
      unitPriceCurrency: (r.unitPriceCurrency as string).trim(),
      lineTotalAmount: r.lineTotalAmount,
      lineTotalCurrency: (r.lineTotalCurrency as string).trim(),
      sourceType: r.sourceType as InvoiceSourceType,
      sourceId: r.sourceId,
    }));
  }

  async checkCurrencyConsistency(client: PoolClient | null, jobId: string, expectedCurrency: string): Promise<boolean> {
    const sql = `
      SELECT
        COALESCE(
          (SELECT bool_and(hourly_rate_currency = $2 AND amount_currency = $2)
           FROM labor_entries WHERE job_id = $1 AND status = 'ACTIVE'),
          true
        ) AND
        COALESCE(
          (SELECT bool_and(unit_price_currency = $2 AND line_total_currency = $2)
           FROM part_issues WHERE job_id = $1 AND (quantity - reversed_quantity) > 0),
          true
        ) AND
        COALESCE(
          (SELECT bool_and(cost_currency = $2)
           FROM sublet_entries WHERE job_id = $1 AND status = 'ACTIVE'),
          true
        ) AS is_consistent`;
    const result = client
      ? await client.query<{ is_consistent: boolean }>(sql, [jobId, expectedCurrency])
      : await this.db.query<{ is_consistent: boolean }>(sql, [jobId, expectedCurrency]);
    return result.rows[0]?.is_consistent ?? true;
  }

  async createDraftInvoice(
    client: PoolClient,
    jobId: string,
    customerId: string,
    actor: string,
  ): Promise<string> {
    const inserted = await client.query<{ id: string }>(
      `WITH totals AS (
         SELECT
           COALESCE((SELECT SUM(amount) FROM labor_entries WHERE job_id = $1 AND status = 'ACTIVE'), 0) AS labor_subtotal,
           COALESCE((SELECT SUM((quantity - reversed_quantity) * unit_price_amount) FROM part_issues WHERE job_id = $1), 0) AS parts_subtotal,
           COALESCE((SELECT SUM(cost_amount) FROM sublet_entries WHERE job_id = $1 AND status = 'ACTIVE'), 0) AS sublet_subtotal
       ),
       calc AS (
         SELECT
           t.labor_subtotal, t.parts_subtotal, t.sublet_subtotal,
           (t.labor_subtotal + t.parts_subtotal + t.sublet_subtotal) AS subtotal,
           fs.currency_code, fs.tax_rate_percent
         FROM totals t, finance_settings fs WHERE fs.id = TRUE
       )
       INSERT INTO invoices (
         job_id, customer_id, status, currency_code,
         labor_subtotal, parts_subtotal, sublet_subtotal, subtotal,
         discount_total, taxable_amount, tax_rate_percent, tax_amount, total_amount,
         created_by, updated_by
       )
       SELECT
         $1, $2, 'DRAFT', c.currency_code,
         c.labor_subtotal, c.parts_subtotal, c.sublet_subtotal, c.subtotal,
         0, c.subtotal, c.tax_rate_percent,
         ROUND(c.subtotal * c.tax_rate_percent / 100, 4),
         c.subtotal + ROUND(c.subtotal * c.tax_rate_percent / 100, 4),
         $3, $3
       FROM calc c
       RETURNING id`,
      [jobId, customerId, actor],
    );
    const invoiceId = inserted.rows[0].id;

    await client.query(
      `INSERT INTO invoice_lines
         (invoice_id, line_type, description, quantity, unit_price_amount, unit_price_currency,
          line_total_amount, line_total_currency, source_type, source_labor_entry_id)
       SELECT $1, 'LABOR', COALESCE(le.description, 'Labor'), ROUND(le.duration_minutes / 60.0, 4),
              le.hourly_rate_amount, le.hourly_rate_currency, le.amount, le.amount_currency,
              'LABOR_ENTRY', le.id
       FROM labor_entries le WHERE le.job_id = $2 AND le.status = 'ACTIVE'`,
      [invoiceId, jobId],
    );

    await client.query(
      `INSERT INTO invoice_lines
         (invoice_id, line_type, description, quantity, unit_price_amount, unit_price_currency,
          line_total_amount, line_total_currency, source_type, source_part_issue_id)
       SELECT $1, 'PART', COALESCE(p.name_en, pi.part_sku), (pi.quantity - pi.reversed_quantity),
              pi.unit_price_amount, pi.unit_price_currency,
              (pi.quantity - pi.reversed_quantity) * pi.unit_price_amount, pi.line_total_currency,
              'PART_ISSUE', pi.id
       FROM part_issues pi JOIN parts p ON p.id = pi.part_id
       WHERE pi.job_id = $2 AND (pi.quantity - pi.reversed_quantity) > 0`,
      [invoiceId, jobId],
    );

    await client.query(
      `INSERT INTO invoice_lines
         (invoice_id, line_type, description, quantity, unit_price_amount, unit_price_currency,
          line_total_amount, line_total_currency, source_type, source_sublet_entry_id)
       SELECT $1, 'SUBLET', se.description, 1, se.cost_amount, se.cost_currency,
              se.cost_amount, se.cost_currency, 'SUBLET_ENTRY', se.id
       FROM sublet_entries se WHERE se.job_id = $2 AND se.status = 'ACTIVE'`,
      [invoiceId, jobId],
    );

    return invoiceId;
  }

  async findInvoiceById(
    client: PoolClient | null,
    invoiceId: string,
    lock = false,
  ): Promise<InvoiceRowWithJob | null> {
    const sql = `
      SELECT
        i.*,
        j.organization_scope_id,
        j.job_number
      FROM invoices i
      JOIN job_cards j ON j.id = i.job_id
      WHERE i.id = $1
      ${lock ? 'FOR UPDATE OF i' : ''}`;
    const result = client
      ? await client.query<InvoiceRowWithJob>(sql, [invoiceId])
      : await this.db.query<InvoiceRowWithJob>(sql, [invoiceId]);
    return result.rows[0] ?? null;
  }

  async findInvoiceLines(
    client: PoolClient | null,
    invoiceId: string,
  ): Promise<InvoiceLineRow[]> {
    const sql = `
      SELECT
        id, invoice_id, line_type, description, quantity,
        unit_price_amount, unit_price_currency,
        line_total_amount, line_total_currency,
        source_type,
        source_labor_entry_id, source_part_issue_id, source_sublet_entry_id
      FROM invoice_lines
      WHERE invoice_id = $1
      ORDER BY id ASC`;
    const result = client
      ? await client.query<InvoiceLineRow>(sql, [invoiceId])
      : await this.db.query<InvoiceLineRow>(sql, [invoiceId]);
    return result.rows;
  }

  async findPaymentReferences(
    client: PoolClient | null,
    invoiceId: string,
  ): Promise<PaymentReferenceRow[]> {
    const sql = `
      SELECT
        id, invoice_id, method, reference,
        amount_amount, amount_currency,
        paid_at, idempotency_key, created_at, created_by
      FROM payment_references
      WHERE invoice_id = $1
      ORDER BY created_at ASC, id ASC`;
    const result = client
      ? await client.query<PaymentReferenceRow>(sql, [invoiceId])
      : await this.db.query<PaymentReferenceRow>(sql, [invoiceId]);
    return result.rows;
  }

  async listInvoices(
    client: PoolClient | null,
    scopeIds: string[],
    query: InvoiceListQuery,
  ): Promise<{ rows: InvoiceRowWithJob[]; total: number }> {
    const where: string[] = ['j.organization_scope_id = ANY($1::uuid[])'];
    const params: unknown[] = [scopeIds];

    if (query.from) {
      params.push(query.from);
      where.push(`i.created_at >= $${params.length}::timestamptz`);
    }
    if (query.to) {
      params.push(query.to);
      where.push(`i.created_at < $${params.length}::timestamptz`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`i.status = $${params.length}`);
    }
    if (query.jobId) {
      params.push(query.jobId);
      where.push(`i.job_id = $${params.length}::uuid`);
    }
    if (query.customerId) {
      params.push(query.customerId);
      where.push(`i.customer_id = $${params.length}::uuid`);
    }
    if (query.invoiceNumber) {
      params.push(query.invoiceNumber);
      where.push(`i.invoice_number = $${params.length}`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    let orderBy = 'i.created_at DESC, i.id ASC';
    if (query.sort) {
      const isDesc = query.sort.startsWith('-');
      const field = isDesc ? query.sort.slice(1) : query.sort;
      const direction = isDesc ? 'DESC' : 'ASC';
      if (field === 'invoiceNumber') {
        orderBy = `i.invoice_number ${direction} NULLS LAST, i.id ASC`;
      } else if (field === 'createdAt') {
        orderBy = `i.created_at ${direction}, i.id ASC`;
      } else if (field === 'issuedAt') {
        orderBy = `i.issued_at ${direction} NULLS LAST, i.id ASC`;
      } else if (field === 'total') {
        orderBy = `i.total_amount ${direction}, i.id ASC`;
      }
    }

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM invoices i
      JOIN job_cards j ON j.id = i.job_id
      ${whereClause}`;

    const countResult = client
      ? await client.query<{ total: number }>(countSql, params)
      : await this.db.query<{ total: number }>(countSql, params);
    const total = countResult.rows[0]?.total ?? 0;

    const offset = (query.page - 1) * query.pageSize;
    const limitParams = [...params, query.pageSize, offset];
    const dataSql = `
      SELECT
        i.*,
        j.organization_scope_id,
        j.job_number
      FROM invoices i
      JOIN job_cards j ON j.id = i.job_id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${limitParams.length - 1} OFFSET $${limitParams.length}`;

    const dataResult = client
      ? await client.query<InvoiceRowWithJob>(dataSql, limitParams)
      : await this.db.query<InvoiceRowWithJob>(dataSql, limitParams);

    return { rows: dataResult.rows, total };
  }

  async updateDraftInvoice(
    client: PoolClient,
    invoiceId: string,
    currentVersion: number,
    data: {
      hasDiscount: boolean;
      discountType: DiscountType | null;
      discountValue: string | null;
      discountReason: string | null;
      discountTotal: string | null;
      notes?: string;
    },
    actor: string,
  ): Promise<InvoiceRow | null> {
    const sql = `
      WITH current_inv AS (
        SELECT id, subtotal, tax_rate_percent
        FROM invoices
        WHERE id = $1 AND version = $2 AND status = 'DRAFT'
        FOR UPDATE
      ),
      recalc AS (
        SELECT
          c.id,
          CASE
            WHEN $3 = TRUE THEN $4::varchar
            ELSE (SELECT discount_type FROM invoices WHERE id = $1)
          END AS new_discount_type,
          CASE
            WHEN $3 = TRUE THEN $5::numeric(14,4)
            ELSE (SELECT discount_value FROM invoices WHERE id = $1)
          END AS new_discount_value,
          CASE
            WHEN $3 = TRUE THEN $6::varchar
            ELSE (SELECT discount_reason FROM invoices WHERE id = $1)
          END AS new_discount_reason,
          CASE
            WHEN $3 = TRUE THEN $7::numeric(14,4)
            ELSE (SELECT discount_total FROM invoices WHERE id = $1)
          END AS new_discount_total,
          c.subtotal,
          c.tax_rate_percent
        FROM current_inv c
      ),
      calc_amounts AS (
        SELECT
          r.*,
          (r.subtotal - r.new_discount_total) AS new_taxable_amount,
          ROUND((r.subtotal - r.new_discount_total) * (r.tax_rate_percent / 100.0), 4) AS new_tax_amount,
          ((r.subtotal - r.new_discount_total) + ROUND((r.subtotal - r.new_discount_total) * (r.tax_rate_percent / 100.0), 4)) AS new_total_amount
        FROM recalc r
      )
      UPDATE invoices i
      SET
        discount_type = ca.new_discount_type,
        discount_value = ca.new_discount_value,
        discount_reason = ca.new_discount_reason,
        discount_total = ca.new_discount_total,
        taxable_amount = ca.new_taxable_amount,
        tax_amount = ca.new_tax_amount,
        total_amount = ca.new_total_amount,
        notes = CASE WHEN $8::boolean THEN $9::varchar ELSE i.notes END,
        version = i.version + 1,
        updated_at = NOW(),
        updated_by = $10
      FROM calc_amounts ca
      WHERE i.id = ca.id
      RETURNING i.*`;

    const result = await client.query<InvoiceRow>(sql, [
      invoiceId,
      currentVersion,
      data.hasDiscount,
      data.discountType,
      data.discountValue,
      data.discountReason,
      data.discountTotal,
      data.notes !== undefined,
      data.notes ?? null,
      actor,
    ]);
    return result.rows[0] ?? null;
  }

  async calculateDiscountTotal(
    client: PoolClient,
    subtotal: string,
    discountType: DiscountType,
    discountValue: string,
  ): Promise<{ discountTotal: string; isNegative: boolean }> {
    const sql = `
      SELECT
        CASE
          WHEN $2 = 'PERCENT' THEN ROUND($1::numeric(14,4) * ($3::numeric / 100.0), 4)
          ELSE ROUND($3::numeric(14,4), 4)
        END::text AS discount_total,
        (
          $1::numeric(14,4) -
          CASE
            WHEN $2 = 'PERCENT' THEN ROUND($1::numeric(14,4) * ($3::numeric / 100.0), 4)
            ELSE ROUND($3::numeric(14,4), 4)
          END
        ) < 0 AS is_negative`;
    const result = await client.query<{ discount_total: string; is_negative: boolean }>(sql, [
      subtotal,
      discountType,
      discountValue,
    ]);
    return {
      discountTotal: result.rows[0].discount_total,
      isNegative: result.rows[0].is_negative,
    };
  }

  async transitionToIssued(
    client: PoolClient,
    invoiceId: string,
    actor: string,
  ): Promise<InvoiceRow | null> {
    const sql = `
      WITH seq_val AS (
        SELECT
          nextval('invoice_number_seq') AS num,
          to_char(NOW() AT TIME ZONE 'UTC', 'YYYY') AS yr
      )
      UPDATE invoices
      SET
        status = 'ISSUED',
        invoice_number = 'INV-' || s.yr || '-' || LPAD(s.num::text, 6, '0'),
        issued_at = NOW(),
        version = version + 1,
        updated_at = NOW(),
        updated_by = $2
      FROM seq_val s
      WHERE invoices.id = $1 AND invoices.status = 'DRAFT'
      RETURNING invoices.*`;
    const result = await client.query<InvoiceRow>(sql, [invoiceId, actor]);
    return result.rows[0] ?? null;
  }

  async transitionToVoid(
    client: PoolClient,
    invoiceId: string,
    reason: string,
    actor: string,
  ): Promise<InvoiceRow | null> {
    const sql = `
      UPDATE invoices
      SET
        status = 'VOID',
        void_reason = $2,
        version = version + 1,
        updated_at = NOW(),
        updated_by = $3
      WHERE id = $1 AND status = 'ISSUED'
      RETURNING *`;
    const result = await client.query<InvoiceRow>(sql, [invoiceId, reason, actor]);
    return result.rows[0] ?? null;
  }

  async findPaymentByIdempotencyKey(
    client: PoolClient | null,
    idempotencyKey: string,
  ): Promise<(PaymentReferenceRow & { job_id: string; organization_scope_id: string }) | null> {
    const sql = `
      SELECT pr.*, i.job_id, j.organization_scope_id
      FROM payment_references pr
      JOIN invoices i ON i.id = pr.invoice_id
      JOIN job_cards j ON j.id = i.job_id
      WHERE pr.idempotency_key = $1`;
    const result = client
      ? await client.query<PaymentReferenceRow & { job_id: string; organization_scope_id: string }>(sql, [idempotencyKey])
      : await this.db.query<PaymentReferenceRow & { job_id: string; organization_scope_id: string }>(sql, [idempotencyKey]);
    return result.rows[0] ?? null;
  }

  async checkAmountsMatch(client: PoolClient, amount1: string, amount2: string): Promise<boolean> {
    const sql = `SELECT ($1::numeric(14,4) = $2::numeric(14,4)) AS is_match`;
    const result = await client.query<{ is_match: boolean }>(sql, [amount1, amount2]);
    return result.rows[0]?.is_match ?? false;
  }

  async recordPayment(
    client: PoolClient,
    invoiceId: string,
    data: {
      method: PaymentMethod;
      reference: string;
      amountAmount: string;
      amountCurrency: string;
      paidAt: string;
      idempotencyKey?: string | null;
    },
    actor: string,
  ): Promise<PaymentReferenceRow> {
    const insertSql = `
      INSERT INTO payment_references (
        invoice_id, method, reference, amount_amount, amount_currency,
        paid_at, idempotency_key, created_at, created_by
      ) VALUES (
        $1, $2, $3, $4::numeric(14,4), $5, $6::timestamptz, $7, NOW(), $8
      ) RETURNING *`;
    const insertResult = await client.query<PaymentReferenceRow>(insertSql, [
      invoiceId,
      data.method,
      data.reference,
      data.amountAmount,
      data.amountCurrency,
      data.paidAt,
      data.idempotencyKey ?? null,
      actor,
    ]);

    const updateInvoiceSql = `
      UPDATE invoices
      SET
        status = 'PAID',
        paid_at = $2::timestamptz,
        version = version + 1,
        updated_at = NOW(),
        updated_by = $3
      WHERE id = $1 AND status = 'ISSUED'`;
    await client.query(updateInvoiceSql, [invoiceId, data.paidAt, actor]);

    return insertResult.rows[0];
  }

  async findCustomerForStatement(
    client: PoolClient | null,
    customerId: string,
  ): Promise<CustomerRowForStatement | null> {
    const sql = `
      SELECT id, organization_scope_id, display_name
      FROM customers
      WHERE id = $1`;
    const result = client
      ? await client.query<CustomerRowForStatement>(sql, [customerId])
      : await this.db.query<CustomerRowForStatement>(sql, [customerId]);
    return result.rows[0] ?? null;
  }

  async getCustomerStatementLines(
    client: PoolClient | null,
    customerId: string,
    from?: string,
    to?: string,
  ): Promise<StatementLineRow[]> {
    const where: string[] = [
      'i.customer_id = $1',
      "i.status IN ('ISSUED', 'PAID', 'VOID')",
    ];
    const params: unknown[] = [customerId];

    if (from) {
      params.push(from);
      where.push(`i.issued_at >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      where.push(`i.issued_at < $${params.length}::timestamptz`);
    }

    const sql = `
      SELECT
        i.id AS invoice_id,
        i.invoice_number,
        j.job_number,
        i.issued_at,
        i.status,
        i.total_amount::text,
        i.currency_code
      FROM invoices i
      JOIN job_cards j ON j.id = i.job_id
      WHERE ${where.join(' AND ')}
      ORDER BY i.issued_at ASC, i.created_at ASC, i.id ASC`;

    const result = client
      ? await client.query<StatementLineRow>(sql, params)
      : await this.db.query<StatementLineRow>(sql, params);
    return result.rows;
  }

  async getCustomerStatementTotals(
    client: PoolClient | null,
    customerId: string,
    from?: string,
    to?: string,
  ): Promise<StatementTotalsRow> {
    const where: string[] = [
      'customer_id = $1',
      "status IN ('ISSUED', 'PAID', 'VOID')",
    ];
    const params: unknown[] = [customerId];

    if (from) {
      params.push(from);
      where.push(`issued_at >= $${params.length}::timestamptz`);
    }
    if (to) {
      params.push(to);
      where.push(`issued_at < $${params.length}::timestamptz`);
    }

    const sql = `
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('ISSUED', 'PAID') THEN total_amount ELSE 0.0000 END), 0.0000)::text AS total_invoiced,
        COALESCE(SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0.0000 END), 0.0000)::text AS total_paid,
        COALESCE(SUM(CASE WHEN status = 'ISSUED' THEN total_amount ELSE 0.0000 END), 0.0000)::text AS total_outstanding
      FROM invoices
      WHERE ${where.join(' AND ')}`;

    const result = client
      ? await client.query<StatementTotalsRow>(sql, params)
      : await this.db.query<StatementTotalsRow>(sql, params);
    return result.rows[0] ?? {
      total_invoiced: '0.0000',
      total_paid: '0.0000',
      total_outstanding: '0.0000',
    };
  }
}

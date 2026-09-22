import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { CustomerListQuery } from './dto/customer.dto';

export interface CustomerRow {
  id: string;
  organization_scope_id: string;
  display_name: string;
  type: 'INDIVIDUAL' | 'BUSINESS';
  phone: string;
  email: string | null;
  preferred_channel: 'PHONE' | 'SMS' | 'EMAIL' | null;
  preferred_locale: 'en' | 'ar' | null;
  status: 'ACTIVE' | 'ARCHIVED';
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

const CUSTOMER_SELECT = `
  c.id, c.organization_scope_id, c.display_name, c.type, c.phone, c.email,
  c.preferred_channel, c.preferred_locale, c.status, c.created_at, c.updated_at,
  c.created_by, c.updated_by`;

const SORT_FIELDS: Record<string, string> = {
  displayName: 'c.display_name',
  createdAt: 'c.created_at',
};

function orderBy(sort?: string): string {
  const requested = sort?.split(',') ?? ['displayName'];
  const clauses = requested.map((part) => {
    const descending = part.startsWith('-');
    const field = SORT_FIELDS[descending ? part.slice(1) : part];
    if (!field) throw new Error('INVALID_SORT');
    return `${field} ${descending ? 'DESC' : 'ASC'}`;
  });
  return `${clauses.join(', ')}, c.id ASC`;
}

@Injectable()
export class CustomersRepository {
  constructor(private readonly db: DatabaseService) {}

  async findScoped(
    id: string,
    scopeIds: string[],
    client?: PoolClient,
    lock = false,
  ): Promise<CustomerRow | null> {
    const sql = `SELECT ${CUSTOMER_SELECT}
      FROM customers c
      WHERE c.id = $1
        AND c.organization_scope_id = ANY($2::uuid[])
        AND EXISTS (
          SELECT 1 FROM organization_scopes os
          WHERE os.id = c.organization_scope_id AND os.status = 'ACTIVE'
        )${lock ? ' FOR UPDATE' : ''}`;
    const result = client
      ? await client.query<CustomerRow>(sql, [id, scopeIds])
      : await this.db.query<CustomerRow>(sql, [id, scopeIds]);
    return result.rows[0] ?? null;
  }

  async findActiveScope(client: PoolClient, scopeId: string): Promise<boolean> {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM organization_scopes
       WHERE id = $1 AND status = 'ACTIVE'
       FOR SHARE`,
      [scopeId],
    );
    return result.rowCount === 1;
  }

  async create(
    client: PoolClient,
    data: {
      organizationScopeId: string;
      displayName: string;
      type: string;
      phone: string;
      email: string | null;
      preferredChannel: string | null;
      preferredLocale: string | null;
      actor: string;
    },
  ): Promise<CustomerRow> {
    const result = await client.query<CustomerRow>(
      `INSERT INTO customers
       (organization_scope_id, display_name, type, phone, email, preferred_channel,
        preferred_locale, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, $8)
       RETURNING ${CUSTOMER_SELECT.replaceAll('c.', '')}`,
      [
        data.organizationScopeId,
        data.displayName,
        data.type,
        data.phone,
        data.email,
        data.preferredChannel,
        data.preferredLocale,
        data.actor,
      ],
    );
    return result.rows[0];
  }

  async update(
    client: PoolClient,
    id: string,
    values: Record<string, unknown>,
    actor: string,
  ): Promise<CustomerRow | null> {
    const entries = Object.entries(values);
    const assignments = entries
      .map(([column], index) => `${column} = $${index + 1}`)
      .join(', ');
    const actorParameter = entries.length + 1;
    const idParameter = entries.length + 2;
    const result = await client.query<CustomerRow>(
      `UPDATE customers
       SET ${assignments}, updated_by = $${actorParameter}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idParameter}
       RETURNING ${CUSTOMER_SELECT.replaceAll('c.', '')}`,
      [...entries.map(([, value]) => value), actor, id],
    );
    return result.rows[0] ?? null;
  }

  async countNonDeliveredJobs(client: PoolClient, customerId: string): Promise<number> {
    const result = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM job_cards
       WHERE customer_id = $1 AND stage <> 'DELIVERED'`,
      [customerId],
    );
    return result.rows[0]?.count ?? 0;
  }

  async list(
    query: CustomerListQuery,
    scopeIds: string[],
  ): Promise<{ rows: CustomerRow[]; totalItems: number }> {
    const where = [
      'c.organization_scope_id = ANY($1::uuid[])',
      `EXISTS (
        SELECT 1 FROM organization_scopes os
        WHERE os.id = c.organization_scope_id AND os.status = 'ACTIVE'
      )`,
    ];
    const params: unknown[] = [scopeIds];
    const addCondition = (sql: string, values: unknown[]): void => {
      let rendered = sql;
      for (const value of values) {
        params.push(value);
        rendered = rendered.replace('?', `$${params.length}`);
      }
      where.push(rendered);
    };

    if (query.q) {
      const pattern = `%${query.q}%`;
      addCondition('(c.display_name ILIKE ? OR c.email ILIKE ? OR c.phone ILIKE ?)', [
        pattern,
        pattern,
        pattern,
      ]);
    }
    if (query.status) addCondition('c.status = ?', [query.status]);
    if (query.phone) addCondition('c.phone = ?', [query.phone]);

    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM customers c ${condition}`,
      params,
    );
    const limitParameter = params.length + 1;
    const offsetParameter = params.length + 2;
    const rows = await this.db.query<CustomerRow>(
      `SELECT ${CUSTOMER_SELECT}
       FROM customers c ${condition}
       ORDER BY ${orderBy(query.sort)}
       LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}

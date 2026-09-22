import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { StoreListQuery, StoreStatus } from './dto/store.dto';

export interface StoreRow {
  id: string;
  organization_scope_id: string;
  code: string;
  name: string;
  status: StoreStatus;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

const STORE_SELECT = `
  s.id, s.organization_scope_id, s.code, s.name, s.status,
  s.created_at, s.updated_at, s.created_by, s.updated_by`;

const STORE_SORT_FIELDS: Record<string, string> = {
  code: 's.code',
  name: 's.name',
};

export function orderStoresBy(sort?: string): string {
  const requested = sort ? sort.split(',') : ['code'];
  return requested
    .map((part) => {
      const descending = part.startsWith('-');
      const fieldName = descending ? part.slice(1) : part;
      const column = STORE_SORT_FIELDS[fieldName];
      if (!column) throw new Error('INVALID_SORT');
      return `${column} ${descending ? 'DESC' : 'ASC'}`;
    })
    .join(', ');
}

@Injectable()
export class StoresRepository {
  constructor(private readonly db: DatabaseService) {}

  async findActiveScope(client: PoolClient, scopeId: string): Promise<boolean> {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM organization_scopes WHERE id = $1 AND status = 'ACTIVE' FOR SHARE`,
      [scopeId],
    );
    return (result.rowCount ?? 0) === 1;
  }

  async findScoped(
    storeId: string,
    scopeIds: string[],
    client?: PoolClient,
    lock = false,
  ): Promise<StoreRow | null> {
    const sql = `SELECT ${STORE_SELECT}
      FROM stores s
      JOIN organization_scopes os ON os.id = s.organization_scope_id AND os.status = 'ACTIVE'
      WHERE s.id = $1 AND s.organization_scope_id = ANY($2::uuid[])${lock ? ' FOR UPDATE OF s' : ''}`;
    const result = client
      ? await client.query<StoreRow>(sql, [storeId, scopeIds])
      : await this.db.query<StoreRow>(sql, [storeId, scopeIds]);
    return result.rows[0] ?? null;
  }

  async create(
    client: PoolClient,
    data: { organizationScopeId: string; code: string; name: string; actor: string },
  ): Promise<StoreRow> {
    const result = await client.query<StoreRow>(
      `INSERT INTO stores
       (organization_scope_id, code, name, status, created_by, updated_by)
       VALUES ($1, $2, $3, 'ACTIVE', $4, $4)
       RETURNING ${STORE_SELECT.replaceAll('s.', '')}`,
      [data.organizationScopeId, data.code, data.name, data.actor],
    );
    return result.rows[0];
  }

  async update(
    client: PoolClient,
    storeId: string,
    values: Record<string, unknown>,
    actor: string,
  ): Promise<StoreRow | null> {
    const entries = Object.entries(values);
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
    const actorParameter = entries.length + 1;
    const idParameter = entries.length + 2;
    const result = await client.query<StoreRow>(
      `UPDATE stores
       SET ${assignments}, updated_by = $${actorParameter}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idParameter}
       RETURNING ${STORE_SELECT.replaceAll('s.', '')}`,
      [...entries.map(([, value]) => value), actor, storeId],
    );
    return result.rows[0] ?? null;
  }

  async hasOnHandOrReservedStock(client: PoolClient, storeId: string): Promise<boolean> {
    const result = await client.query<{ hasStock: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM stock_balances
         WHERE store_id = $1 AND (on_hand > 0 OR reserved > 0)
       ) AS "hasStock"`,
      [storeId],
    );
    return result.rows[0]?.hasStock ?? false;
  }

  async list(
    query: StoreListQuery,
    scopeIds: string[],
  ): Promise<{ rows: StoreRow[]; totalItems: number }> {
    const where = [
      's.organization_scope_id = ANY($1::uuid[])',
      `EXISTS (SELECT 1 FROM organization_scopes os
               WHERE os.id = s.organization_scope_id AND os.status = 'ACTIVE')`,
    ];
    const params: unknown[] = [scopeIds];
    if (query.status) {
      params.push(query.status);
      where.push(`s.status = $${params.length}`);
    }
    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM stores s ${condition}`,
      params,
    );
    const rows = await this.db.query<StoreRow>(
      `SELECT ${STORE_SELECT} FROM stores s ${condition}
       ORDER BY ${orderStoresBy(query.sort)}, s.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}

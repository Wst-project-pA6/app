import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';

export interface AccessUser {
  id: string;
  email: string;
  display_name: string;
  preferred_locale: string;
  status: 'ACTIVE' | 'DISABLED';
  roles: string[];
  organization_scope_ids: string[];
  must_change_password: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  student_id: string | null;
}

export interface ScopeRow {
  id: string;
  code: string;
  name: string;
  type: string;
  parent_id: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

const USER_SELECT = `
  u.id, u.email, u.display_name, u.preferred_locale, u.status,
  u.must_change_password, u.last_login_at, u.created_at, u.updated_at,
  u.created_by, u.updated_by,
  COALESCE((
    SELECT array_agg(ur.role_code ORDER BY ur.role_code)
    FROM user_roles ur WHERE ur.user_id = u.id
  ), ARRAY[]::text[]) AS roles,
  COALESCE((
    SELECT array_agg(uos.organization_scope_id::text ORDER BY uos.organization_scope_id::text)
    FROM user_organization_scopes uos WHERE uos.user_id = u.id
  ), ARRAY[]::text[]) AS organization_scope_ids,
  (SELECT s.id FROM students s WHERE s.user_id = u.id ORDER BY s.id LIMIT 1) AS student_id`;

interface UserListFilters {
  page: number;
  pageSize: number;
  q?: string;
  role?: string;
  status?: string;
  organizationScopeId?: string;
  sort?: string;
}

@Injectable()
export class AccessRepository {
  constructor(private readonly db: DatabaseService) {}

  async findUser(id: string, client?: PoolClient, lock = false): Promise<AccessUser | null> {
    const lockClause = lock ? ' FOR UPDATE' : '';
    if (client) {
      const result = await client.query<AccessUser>(
        `SELECT ${USER_SELECT} FROM users u WHERE u.id = $1${lockClause}`,
        [id],
      );
      return result.rows[0] ?? null;
    }
    return this.db.queryOne<AccessUser>(
      `SELECT ${USER_SELECT} FROM users u WHERE u.id = $1`,
      [id],
    );
  }

  async listUsers(query: UserListFilters): Promise<{ rows: AccessUser[]; totalItems: number }> {
    const fields: Record<string, string> = {
      displayName: 'u.display_name',
      email: 'u.email',
      createdAt: 'u.created_at',
    };
    const sort = query.sort ?? '-createdAt';
    const descending = sort.startsWith('-');
    const field = fields[descending ? sort.slice(1) : sort];
    if (!field) throw new Error('INVALID_SORT');

    const where: string[] = [];
    const params: unknown[] = [];
    const addCondition = (sql: string, values: unknown[]): void => {
      let rendered = sql;
      for (const value of values) {
        params.push(value);
        rendered = rendered.replace('?', `$${params.length}`);
      }
      where.push(rendered);
    };

    if (query.q) {
      addCondition('(u.email ILIKE ? OR u.display_name ILIKE ?)', [`%${query.q}%`, `%${query.q}%`]);
    }
    if (query.role) {
      addCondition(
        'EXISTS (SELECT 1 FROM user_roles urf WHERE urf.user_id = u.id AND urf.role_code = ?)',
        [query.role],
      );
    }
    if (query.status) addCondition('u.status = ?', [query.status]);
    if (query.organizationScopeId) {
      addCondition(
        'EXISTS (SELECT 1 FROM user_organization_scopes usf WHERE usf.user_id = u.id AND usf.organization_scope_id = ?)',
        [query.organizationScopeId],
      );
    }

    const condition = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM users u ${condition}`,
      params,
    );
    const limitParameter = params.length + 1;
    const offsetParameter = params.length + 2;
    const rows = await this.db.query<AccessUser>(
      `SELECT ${USER_SELECT} FROM users u ${condition}
       ORDER BY ${field} ${descending ? 'DESC' : 'ASC'}, u.id
       LIMIT $${limitParameter} OFFSET $${offsetParameter}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }

  async createUser(
    client: PoolClient,
    data: { email: string; displayName: string; preferredLocale: string; hash: string; actor: string },
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO users
       (email, display_name, preferred_locale, password_hash, must_change_password, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, TRUE, 'ACTIVE', $5, $5) RETURNING id`,
      [data.email, data.displayName, data.preferredLocale, data.hash, data.actor],
    );
    return result.rows[0].id;
  }

  async updateUser(client: PoolClient, id: string, values: Record<string, unknown>): Promise<void> {
    const entries = Object.entries(values);
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
    await client.query(
      `UPDATE users SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = $${entries.length + 1}`,
      [...entries.map(([, value]) => value), id],
    );
  }

  revokeTokens(client: PoolClient, id: string): Promise<unknown> {
    return client.query(
      'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL',
      [id],
    );
  }

  lockActiveSystemAdmins(client: PoolClient): Promise<{ id: string }[]> {
    // No DISTINCT: Postgres rejects "SELECT DISTINCT ... FOR UPDATE", and it would be redundant
    // anyway — user_roles has PRIMARY KEY (user_id, role_code), so this join can never produce
    // more than one row per user_id for a fixed role_code.
    return client
      .query<{ id: string }>(
        `SELECT u.id FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         WHERE u.status = 'ACTIVE' AND ur.role_code = 'SYSTEM_ADMIN'
         ORDER BY u.id FOR UPDATE`,
      )
      .then((result) => result.rows);
  }

  async replaceRoles(client: PoolClient, id: string, roles: string[], actor: string): Promise<void> {
    await client.query('DELETE FROM user_roles WHERE user_id = $1', [id]);
    if (roles.length === 0) return;
    await client.query(
      `INSERT INTO user_roles (user_id, role_code, granted_by)
       SELECT $1, role_code, $3 FROM unnest($2::text[]) AS role_code`,
      [id, roles, actor],
    );
  }

  async lockActiveScopes(client: PoolClient, ids: string[]): Promise<{ id: string }[]> {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM organization_scopes
       WHERE id = ANY($1::uuid[]) AND status = 'ACTIVE'
       ORDER BY id FOR UPDATE`,
      [ids],
    );
    return result.rows;
  }

  async replaceScopes(client: PoolClient, id: string, scopes: string[], actor: string): Promise<void> {
    await client.query('DELETE FROM user_organization_scopes WHERE user_id = $1', [id]);
    if (scopes.length === 0) return;
    await client.query(
      `INSERT INTO user_organization_scopes (user_id, organization_scope_id, granted_by)
       SELECT $1, organization_scope_id, $3 FROM unnest($2::uuid[]) AS organization_scope_id`,
      [id, scopes, actor],
    );
  }

  roles() {
    return this.db.query(
      `SELECT r.code, r.description,
       COALESCE(array_agg(DISTINCT rp.permission_code ORDER BY rp.permission_code)
         FILTER (WHERE rp.permission_code IS NOT NULL), ARRAY[]::text[]) AS permissions
       FROM roles r LEFT JOIN role_permissions rp ON rp.role_code = r.code
       GROUP BY r.code, r.description ORDER BY r.code`,
    );
  }

  async listScopes(query: { page: number; pageSize: number; sort?: string; type?: string }) {
    const fields: Record<string, string> = { name: 'name', code: 'code', createdAt: 'created_at' };
    const sort = query.sort ?? 'createdAt';
    const descending = sort.startsWith('-');
    const field = fields[descending ? sort.slice(1) : sort];
    if (!field) throw new Error('INVALID_SORT');

    const params: unknown[] = [];
    const where = query.type ? ' WHERE type = $1' : '';
    if (query.type) params.push(query.type);
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM organization_scopes${where}`,
      params,
    );
    const rows = await this.db.query<ScopeRow>(
      `SELECT id, code, name, type, parent_id, status, created_at, updated_at, created_by, updated_by
       FROM organization_scopes${where}
       ORDER BY ${field} ${descending ? 'DESC' : 'ASC'}, id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }

  findScope(id: string): Promise<ScopeRow | null> {
    return this.db.queryOne<ScopeRow>(
      'SELECT id, code, name, type, parent_id, status, created_at, updated_at, created_by, updated_by FROM organization_scopes WHERE id = $1',
      [id],
    );
  }

  async createScope(
    client: PoolClient,
    data: { code: string; name: string; type: string; parentId?: string; actor: string },
  ): Promise<ScopeRow> {
    const result = await client.query<ScopeRow>(
      `INSERT INTO organization_scopes
       (code, name, type, parent_id, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $5)
       RETURNING id, code, name, type, parent_id, status, created_at, updated_at, created_by, updated_by`,
      [data.code, data.name, data.type, data.parentId ?? null, data.actor],
    );
    return result.rows[0];
  }

  updateScope(id: string, values: Record<string, unknown>, actor: string): Promise<ScopeRow | null> {
    const entries = Object.entries(values);
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
    return this.db.queryOne<ScopeRow>(
      `UPDATE organization_scopes SET ${assignments}, updated_by = $${entries.length + 1},
       updated_at = CURRENT_TIMESTAMP WHERE id = $${entries.length + 2}
       RETURNING id, code, name, type, parent_id, status, created_at, updated_at, created_by, updated_by`,
      [...entries.map(([, value]) => value), actor, id],
    );
  }
}

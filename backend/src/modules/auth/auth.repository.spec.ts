import { AuthRepository } from './auth.repository';
import type { PoolClient } from 'pg';

describe('AuthRepository', () => {
  it('resolves only the active user and returns database-derived sorted arrays', async () => {
    const queryOne = jest.fn().mockResolvedValue({
      id: '123e4567-e89b-12d3-a456-426614174000', email: 'u@example.test', display_name: 'U',
      preferred_locale: 'en', roles: ['A', 'B'], permissions: ['jobs.read', 'jobs.write'],
      organization_scope_ids: ['org-a', 'org-b'], student_id: '223e4567-e89b-12d3-a456-426614174000', must_change_password: false,
    });
    const repository = new AuthRepository({ queryOne } as never);
    await expect(repository.findAuthenticatedPrincipal('123e4567-e89b-12d3-a456-426614174000')).resolves.toEqual({
      id: '123e4567-e89b-12d3-a456-426614174000', email: 'u@example.test', displayName: 'U',
      preferredLocale: 'en', roles: ['A', 'B'], permissions: ['jobs.read', 'jobs.write'],
      organizationScopeIds: ['org-a', 'org-b'], studentId: '223e4567-e89b-12d3-a456-426614174000', mustChangePassword: false,
    });
    const [sql, params] = queryOne.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM users u');
    expect(sql).toContain('user_roles');
    expect(sql).toContain('role_permissions');
    expect(sql).toContain('user_organization_scopes');
    expect(sql).toContain('uos.organization_scope_id::text');
    expect(sql).toContain('ARRAY[]::text[]');
    expect(sql).toContain('FROM students');
    expect(sql).toContain("u.status = 'ACTIVE'");
    expect(sql).not.toContain('password_hash');
    expect(params).toEqual(['123e4567-e89b-12d3-a456-426614174000']);
  });

  it('uses parameterized exact-email SQL and supplied transaction clients', async () => {
    const queryOne = jest.fn().mockResolvedValue(null);
    const database = { queryOne } as never;
    const repository = new AuthRepository(database);
    await repository.findByEmail('Exact@Example.test');
    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining('WHERE email = $1'), ['Exact@Example.test']);

    const client = { query: jest.fn()
      .mockResolvedValueOnce({ rows: [{ status: 'ACTIVE', password_hash: 'h1', must_change_password: false }] })
      .mockResolvedValue({ rows: [] }) } as never;
    await repository.lockUser(client, 'u1');
    const expiresAt = new Date('2026-01-08T00:00:00Z');
    await repository.insertRefreshToken(client, 'u1', 'f1', 'h1', expiresAt);
    await repository.updateLastLogin(client, 'u1');
    expect((client as { query: jest.Mock }).query.mock.calls).toEqual([
      ['SELECT status, password_hash, must_change_password FROM users WHERE id = $1 FOR UPDATE', ['u1']],
      ['INSERT INTO refresh_tokens (token_hash, family_id, user_id, expires_at) VALUES ($1, $2, $3, $4)', ['h1', 'f1', 'u1', expiresAt]],
      ['UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', ['u1']],
    ]);
  });

  it('registers a self-registered user as ACTIVE with mustChangePassword false and no grants', async () => {
    const createdAt = new Date('2026-01-08T00:00:00Z');
    const query = jest.fn().mockResolvedValue({
      rows: [{
        id: 'u1', email: 'new@example.test', display_name: 'New User', preferred_locale: 'en',
        status: 'ACTIVE', must_change_password: false, created_at: createdAt, updated_at: createdAt,
      }],
    });
    const client = { query } as unknown as PoolClient;
    const repository = new AuthRepository({} as never);
    await expect(repository.registerUser(client, {
      email: 'new@example.test', displayName: 'New User', preferredLocale: 'en', passwordHash: 'argon2-hash',
    })).resolves.toEqual({
      id: 'u1', email: 'new@example.test', display_name: 'New User', preferred_locale: 'en',
      status: 'ACTIVE', must_change_password: false, created_at: createdAt, updated_at: createdAt,
    });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO users');
    expect(sql).toContain("must_change_password, status)");
    expect(sql).toContain("VALUES ($1, $2, $3, $4, FALSE, 'ACTIVE')");
    expect(sql).not.toContain('created_by');
    expect(params).toEqual(['new@example.test', 'New User', 'en', 'argon2-hash']);
  });

  it('uses parameterized refresh queries and preserves the user-first lock sequence', async () => {
    const queryOne = jest.fn(async (_sql: string, _params?: unknown[]) => ({ user_id: 'u1' }));
    const repository = new AuthRepository({ queryOne } as never);
    const hash = 'a'.repeat(64);
    await expect(repository.findRefreshTokenUserId(hash)).resolves.toEqual({ user_id: 'u1' });
    expect(queryOne).toHaveBeenCalledWith(
      'SELECT user_id FROM refresh_tokens WHERE token_hash = $1 LIMIT 1', [hash],
    );

    const query = jest.fn<Promise<unknown>, [string, unknown[]?]>();
    query
      .mockResolvedValueOnce({ rows: [{ id: 't1', user_id: 'u1', family_id: 'f1', expires_at: new Date(), rotated_at: null, revoked_at: null }] })
      .mockResolvedValue({ rows: [] });
    const client = { query } as unknown as PoolClient;
    await repository.lockUser(client, 'u1');
    await repository.lockRefreshToken(client, hash);
    await repository.markRefreshTokenRotated(client, 't1');
    await repository.revokeRefreshFamily(client, 'u1', 'f1');
    await repository.updatePassword(client, 'u1', 'argon2-hash');
    await repository.revokeAllRefreshTokens(client, 'u1');

    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'SELECT status, password_hash, must_change_password FROM users WHERE id = $1 FOR UPDATE',
      expect.stringContaining('FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE'),
      'UPDATE refresh_tokens SET rotated_at = CURRENT_TIMESTAMP WHERE id = $1',
      expect.stringContaining('WHERE user_id = $1 AND family_id = $2'),
      'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
      'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL',
    ]);
    expect(query.mock.calls[1][1]).toEqual([hash]);
    expect(query.mock.calls[2][1]).toEqual(['t1']);
    expect(query.mock.calls[3][1]).toEqual(['u1', 'f1']);
    expect(query.mock.calls[4][1]).toEqual(['argon2-hash', 'u1']);
    expect(query.mock.calls[5][1]).toEqual(['u1']);
  });
});

import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import type { AuthenticatedPrincipal } from './authenticated-principal';

export interface AuthUser {
  id: string;
  email: string;
  password_hash: string;
  status: 'ACTIVE' | 'DISABLED';
  must_change_password: boolean;
}

export interface LockedAuthUser {
  status: AuthUser['status'];
  password_hash: string;
  must_change_password: boolean;
}

export interface RegisteredUserRow {
  id: string;
  email: string;
  display_name: string;
  preferred_locale: string;
  status: 'ACTIVE';
  must_change_password: false;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  family_id: string;
  expires_at: Date;
  rotated_at: Date | null;
  revoked_at: Date | null;
}

interface AuthenticatedPrincipalRow {
  id: string;
  email: string;
  display_name: string;
  preferred_locale: string;
  roles: string[];
  permissions: string[];
  organization_scope_ids: string[];
  student_id: string | null;
  must_change_password: boolean;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly database: DatabaseService) {}

  async findAuthenticatedPrincipal(userId: string): Promise<AuthenticatedPrincipal | null> {
    const row = await this.database.queryOne<AuthenticatedPrincipalRow>(
      `SELECT u.id, u.email, u.display_name, u.preferred_locale,
              COALESCE((SELECT array_agg(DISTINCT ur.role_code ORDER BY ur.role_code)
                        FROM user_roles ur WHERE ur.user_id = u.id), ARRAY[]::text[]) AS roles,
              COALESCE((SELECT array_agg(DISTINCT rp.permission_code ORDER BY rp.permission_code)
                        FROM user_roles ur
                        JOIN role_permissions rp ON rp.role_code = ur.role_code
                        WHERE ur.user_id = u.id), ARRAY[]::text[]) AS permissions,
              COALESCE((SELECT array_agg(DISTINCT uos.organization_scope_id::text ORDER BY uos.organization_scope_id::text)
                        FROM user_organization_scopes uos
                        JOIN organization_scopes os ON os.id = uos.organization_scope_id AND os.status = 'ACTIVE'
                        WHERE uos.user_id = u.id), ARRAY[]::text[])
                AS organization_scope_ids,
              (SELECT s.id FROM students s WHERE s.user_id = u.id ORDER BY s.id LIMIT 1) AS student_id,
              u.must_change_password
       FROM users u
       WHERE u.id = $1 AND u.status = 'ACTIVE'
       LIMIT 1`,
      [userId],
    );
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      preferredLocale: row.preferred_locale,
      roles: row.roles,
      permissions: row.permissions,
      organizationScopeIds: row.organization_scope_ids,
      ...(row.student_id ? { studentId: row.student_id } : {}),
      mustChangePassword: row.must_change_password,
    };
  }

  findByEmail(email: string): Promise<AuthUser | null> {
    return this.database.queryOne<AuthUser>(
      'SELECT id, email, password_hash, status, must_change_password FROM users WHERE email = $1 LIMIT 1',
      [email],
    );
  }

  lockUser(client: PoolClient, userId: string): Promise<LockedAuthUser | null> {
    return client
      .query<LockedAuthUser>(
        'SELECT status, password_hash, must_change_password FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      )
      .then((result) => result.rows[0] ?? null);
  }

  registerUser(
    client: PoolClient,
    data: { email: string; displayName: string; preferredLocale: string; passwordHash: string },
  ): Promise<RegisteredUserRow> {
    return client
      .query<RegisteredUserRow>(
        `INSERT INTO users (email, display_name, preferred_locale, password_hash, must_change_password, status)
         VALUES ($1, $2, $3, $4, FALSE, 'ACTIVE')
         RETURNING id, email, display_name, preferred_locale, status, must_change_password, created_at, updated_at`,
        [data.email, data.displayName, data.preferredLocale, data.passwordHash],
      )
      .then((result) => result.rows[0]);
  }

  findRefreshTokenUserId(tokenHash: string): Promise<{ user_id: string } | null> {
    return this.database.queryOne<{ user_id: string }>(
      'SELECT user_id FROM refresh_tokens WHERE token_hash = $1 LIMIT 1',
      [tokenHash],
    );
  }

  lockRefreshToken(client: PoolClient, tokenHash: string): Promise<RefreshTokenRow | null> {
    return client
      .query<RefreshTokenRow>(
        `SELECT id, user_id, family_id, expires_at, rotated_at, revoked_at
         FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
        [tokenHash],
      )
      .then((result) => result.rows[0] ?? null);
  }

  markRefreshTokenRotated(client: PoolClient, tokenId: string): Promise<void> {
    return client
      .query('UPDATE refresh_tokens SET rotated_at = CURRENT_TIMESTAMP WHERE id = $1', [tokenId])
      .then(() => undefined);
  }

  revokeRefreshFamily(client: PoolClient, userId: string, familyId: string): Promise<void> {
    return client
      .query(
        `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND family_id = $2 AND revoked_at IS NULL`,
        [userId, familyId],
      )
      .then(() => undefined);
  }

  updatePassword(client: PoolClient, userId: string, passwordHash: string): Promise<void> {
    return client
      .query(
        'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
        [passwordHash, userId],
      )
      .then(() => undefined);
  }

  revokeAllRefreshTokens(client: PoolClient, userId: string): Promise<void> {
    return client
      .query(
        'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND revoked_at IS NULL',
        [userId],
      )
      .then(() => undefined);
  }

  insertRefreshToken(
    client: PoolClient,
    userId: string,
    familyId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    return client
      .query(
        'INSERT INTO refresh_tokens (token_hash, family_id, user_id, expires_at) VALUES ($1, $2, $3, $4)',
        [tokenHash, familyId, userId, expiresAt],
      )
      .then(() => undefined);
  }

  updateLastLogin(client: PoolClient, userId: string): Promise<void> {
    return client
      .query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [userId])
      .then(() => undefined);
  }
}

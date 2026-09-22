import { HttpStatus, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { LoginDto } from './dto/login.dto';
import { AuthRepository } from './auth.repository';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { hashRefreshToken } from './token.service';
import type { ChangePasswordRequest } from './dto/change-password.dto';
import type { LogoutRequest } from './dto/logout.dto';
import type { RefreshRequest } from './dto/refresh.dto';
import type { RegisterRequest } from './dto/register.dto';

const invalidCredentials = (): AppError =>
  new AppError(HttpStatus.UNAUTHORIZED, ErrorCode.INVALID_CREDENTIALS, 'Invalid credentials');
const unauthenticated = (): AppError =>
  new AppError(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHENTICATED, 'Unauthenticated');
const duplicateEmail = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.DUPLICATE_RESOURCE, 'Duplicate resource');

export interface RegisteredUser {
  id: string;
  email: string;
  displayName: string;
  preferredLocale: string;
  status: 'ACTIVE';
  roles: string[];
  organizationScopeIds: string[];
  mustChangePassword: false;
  createdAt: Date;
  updatedAt: Date;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  mustChangePassword: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly database: DatabaseService,
  ) {}

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.repository.findByEmail(dto.email);
    const validPassword = await this.passwordService.verify(
      dto.password,
      user?.password_hash,
    );
    if (!user || !validPassword || user.status !== 'ACTIVE') throw invalidCredentials();

    return this.database.runInTransaction(async (client) => {
      const lockedUser = await this.repository.lockUser(client, user.id);
      if (
        !lockedUser ||
        lockedUser.status !== 'ACTIVE' ||
        lockedUser.password_hash !== user.password_hash
      ) {
        throw invalidCredentials();
      }
      const issued = await this.tokenService.issue(user.id);
      await this.repository.insertRefreshToken(
        client,
        user.id,
        issued.familyId,
        issued.refreshTokenHash,
        issued.refreshExpiresAt,
      );
      await this.repository.updateLastLogin(client, user.id);
      return {
        accessToken: issued.accessToken,
        refreshToken: issued.refreshToken,
        tokenType: 'Bearer',
        expiresIn: issued.accessTokenTtlSeconds,
        mustChangePassword: lockedUser.must_change_password,
      };
    });
  }

  async register(dto: RegisterRequest): Promise<RegisteredUser> {
    const passwordHash = await this.passwordService.hash(dto.password);
    try {
      const row = await this.database.runInTransaction((client) =>
        this.repository.registerUser(client, {
          email: dto.email,
          displayName: dto.displayName,
          preferredLocale: dto.preferredLocale,
          passwordHash,
        }),
      );
      return {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        preferredLocale: row.preferred_locale,
        status: row.status,
        roles: [],
        organizationScopeIds: [],
        mustChangePassword: row.must_change_password,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      if ((error as { code?: string })?.code === '23505') throw duplicateEmail();
      throw error;
    }
  }

  async refresh(dto: RefreshRequest): Promise<TokenPair> {
    const tokenHash = hashRefreshToken(dto.refreshToken);
    const discovered = await this.repository.findRefreshTokenUserId(tokenHash);
    if (!discovered) throw unauthenticated();

    const result = await this.database.runInTransaction(async (client) => {
      const user = await this.repository.lockUser(client, discovered.user_id);
      const token = await this.repository.lockRefreshToken(client, tokenHash);
      if (!token || token.user_id !== discovered.user_id) return { kind: 'invalid' as const };
      if (token.rotated_at) {
        await this.repository.revokeRefreshFamily(client, token.user_id, token.family_id);
        return { kind: 'invalid' as const };
      }
      if (!user || user.status !== 'ACTIVE') return { kind: 'invalid' as const };
      if (token.revoked_at || token.expires_at.getTime() <= Date.now()) {
        return { kind: 'invalid' as const };
      }

      await this.repository.markRefreshTokenRotated(client, token.id);
      const issued = await this.tokenService.issueSuccessor(
        token.user_id,
        token.family_id,
        token.expires_at,
      );
      await this.repository.insertRefreshToken(
        client,
        token.user_id,
        issued.familyId,
        issued.refreshTokenHash,
        issued.refreshExpiresAt,
      );
      return {
        kind: 'success' as const,
        pair: {
          accessToken: issued.accessToken,
          refreshToken: issued.refreshToken,
          tokenType: 'Bearer' as const,
          expiresIn: issued.accessTokenTtlSeconds,
          mustChangePassword: user.must_change_password,
        },
      };
    });

    if (result.kind !== 'success') throw unauthenticated();
    return result.pair;
  }

  async logout(userId: string, dto: LogoutRequest): Promise<void> {
    const tokenHash = hashRefreshToken(dto.refreshToken);
    const discovered = await this.repository.findRefreshTokenUserId(tokenHash);
    if (!discovered || discovered.user_id !== userId) return;

    await this.database.runInTransaction(async (client) => {
      const user = await this.repository.lockUser(client, userId);
      if (!user || user.status !== 'ACTIVE') return;
      const token = await this.repository.lockRefreshToken(client, tokenHash);
      if (!token || token.user_id !== userId || token.revoked_at || token.expires_at.getTime() <= Date.now()) return;
      await this.repository.revokeRefreshFamily(client, userId, token.family_id);
    });
  }

  async changePassword(userId: string, dto: ChangePasswordRequest): Promise<void> {
    const changed = await this.database.runInTransaction(async (client) => {
      const user = await this.repository.lockUser(client, userId);
      if (!user || user.status !== 'ACTIVE') return false;
      if (!await this.passwordService.verify(dto.currentPassword, user.password_hash)) return false;

      const passwordHash = await this.passwordService.hash(dto.newPassword);
      await this.repository.updatePassword(client, userId, passwordHash);
      await this.repository.revokeAllRefreshTokens(client, userId);
      return true;
    });
    if (!changed) throw invalidCredentials();
  }
}

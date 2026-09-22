import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

export function hashRefreshToken(refreshToken: string): string {
  return createHash('sha256').update(refreshToken, 'utf8').digest('hex');
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  familyId: string;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
  accessTokenTtlSeconds: number;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async issue(userId: string, now = new Date()): Promise<IssuedTokens> {
    const refreshTokenTtlSeconds = this.config.getOrThrow<number>('auth.refreshTokenTtlSeconds');
    return this.issueWithFamily(
      userId,
      randomUUID(),
      new Date(now.getTime() + refreshTokenTtlSeconds * 1000),
    );
  }

  async issueSuccessor(userId: string, familyId: string, refreshExpiresAt: Date): Promise<IssuedTokens> {
    return this.issueWithFamily(userId, familyId, refreshExpiresAt);
  }

  private async issueWithFamily(userId: string, familyId: string, refreshExpiresAt: Date): Promise<IssuedTokens> {
    const accessToken = await this.jwtService.signAsync({ sub: userId });
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const accessTokenTtlSeconds = this.config.getOrThrow<number>('auth.accessTokenTtlSeconds');
    return { accessToken, refreshToken, familyId, refreshTokenHash, refreshExpiresAt, accessTokenTtlSeconds };
  }
}

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { TokenService } from './token.service';

describe('TokenService', () => {
  it('issues the configured JWT and hashed random refresh token', async () => {
    const config = new ConfigService({ auth: {
      jwtSecret: 'x'.repeat(32), issuer: 'wst-api', audience: 'wst-client', accessTokenTtlSeconds: 600, refreshTokenTtlSeconds: 604800,
    } });
    const service = new TokenService(new JwtService({ secret: 'x'.repeat(32), signOptions: {
      algorithm: 'HS256', issuer: 'wst-api', audience: 'wst-client', expiresIn: 600,
    } }), config);
    const now = new Date('2026-01-01T00:00:00.000Z');
    const pair = await service.issue('user-1', now);
    const claims = await new JwtService().verifyAsync(pair.accessToken, {
      secret: 'x'.repeat(32), algorithms: ['HS256'], issuer: 'wst-api', audience: 'wst-client',
    });
    expect(claims).toEqual(expect.objectContaining({ sub: 'user-1', iss: 'wst-api', aud: 'wst-client' }));
    expect((claims.exp as number) - (claims.iat as number)).toBe(600);
    expect(pair.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(pair.refreshTokenHash).toBe(createHash('sha256').update(pair.refreshToken, 'utf8').digest('hex'));
    expect(pair.familyId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(pair.refreshExpiresAt).toEqual(new Date('2026-01-08T00:00:00.000Z'));
    expect(Object.keys(claims).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sub']);
    expect(pair.accessTokenTtlSeconds).toBe(600);
  });

  it('issues a successor with the same family and exact absolute expiry', async () => {
    const config = new ConfigService({ auth: {
      jwtSecret: 'x'.repeat(32), issuer: 'wst-api', audience: 'wst-client', accessTokenTtlSeconds: 600,
      refreshTokenTtlSeconds: 604800,
    } });
    const service = new TokenService(new JwtService({ secret: 'x'.repeat(32), signOptions: {
      algorithm: 'HS256', issuer: 'wst-api', audience: 'wst-client', expiresIn: 600,
    } }), config);
    const expiresAt = new Date('2026-01-05T12:34:56.789Z');
    const successor = await service.issueSuccessor('user-1', 'family-1', expiresAt);
    expect(successor.familyId).toBe('family-1');
    expect(successor.refreshExpiresAt).toBe(expiresAt);
    expect(successor.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(successor.refreshTokenHash).toBe(createHash('sha256').update(successor.refreshToken, 'utf8').digest('hex'));
  });
});

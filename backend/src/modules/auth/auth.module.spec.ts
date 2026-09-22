import { ConfigService } from '@nestjs/config';
import { createAuthJwtOptions } from './auth.module';

describe('AuthModule JWT configuration', () => {
  it('rejects missing and short secrets without exposing a secret', () => {
    for (const secret of [undefined, 'short']) {
      expect(() => createAuthJwtOptions(new ConfigService({ auth: { jwtSecret: secret, issuer: 'wst-api', audience: 'wst-client', accessTokenTtlSeconds: 600 } })))
        .toThrow('AUTH_JWT_SECRET must be at least 32 UTF-8 bytes');
    }
  });

  it('produces the exact HS256 JWT options from configuration', () => {
    const options = createAuthJwtOptions(new ConfigService({ auth: {
      jwtSecret: 'x'.repeat(32), issuer: 'wst-api', audience: 'wst-client', accessTokenTtlSeconds: 600,
    } }));
    expect(options).toEqual({
      secret: 'x'.repeat(32),
      signOptions: { algorithm: 'HS256', issuer: 'wst-api', audience: 'wst-client', expiresIn: 600 },
    });
  });
});

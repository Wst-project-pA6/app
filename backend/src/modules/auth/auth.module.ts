import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { AuthRepository } from './auth.repository';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LOGIN_RATE_LIMITER_CLOCK, LoginRateLimiter } from './login-rate-limiter';
import { AUTH_OPERATION_RATE_LIMITER_CLOCK, AuthOperationRateLimiter } from './auth-operation-rate-limiter';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

export function createAuthJwtOptions(config: ConfigService): JwtModuleOptions {
  const secret = config.get<string>('auth.jwtSecret');
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('AUTH_JWT_SECRET must be at least 32 UTF-8 bytes');
  }
  return {
    secret,
    signOptions: {
      algorithm: 'HS256',
      issuer: config.getOrThrow<string>('auth.issuer'),
      audience: config.getOrThrow<string>('auth.audience'),
      expiresIn: config.getOrThrow<number>('auth.accessTokenTtlSeconds'),
    },
  };
}

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: createAuthJwtOptions,
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthRepository,
    AuthService,
    PasswordService,
    TokenService,
    LoginRateLimiter,
    { provide: LOGIN_RATE_LIMITER_CLOCK, useValue: Date.now },
    AuthOperationRateLimiter,
    { provide: AUTH_OPERATION_RATE_LIMITER_CLOCK, useValue: Date.now },
  ],
  exports: [AuthService, PasswordService, TokenService, AuthRepository, JwtModule],
})
export class AuthModule {}

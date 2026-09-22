import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { RequestContext } from '../../common/request-context/request-context';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { AuthController } from './auth.controller';
import { AuthService, RegisteredUser, TokenPair } from './auth.service';
import { LoginRateLimiter } from './login-rate-limiter';
import { AuthOperationRateLimiter } from './auth-operation-rate-limiter';
import type { AuthenticatedPrincipal } from './authenticated-principal';

describe('AuthController HTTP', () => {
  let app: INestApplication<App>;
  const tokenPair: TokenPair = {
    accessToken: 'access',
    refreshToken: 'refresh',
    tokenType: 'Bearer',
    expiresIn: 600,
    mustChangePassword: false,
  };
  const registeredUser: RegisteredUser = {
    id: '223e4567-e89b-12d3-a456-426614174000', email: 'new@example.test', displayName: 'New User',
    preferredLocale: 'en', status: 'ACTIVE', roles: [], organizationScopeIds: [], mustChangePassword: false,
    createdAt: new Date('2026-01-08T00:00:00Z'), updatedAt: new Date('2026-01-08T00:00:00Z'),
  };
  const login = jest.fn<Promise<TokenPair>, [{ email: string; password: string }]>().mockResolvedValue(tokenPair);
  const register = jest.fn<Promise<RegisteredUser>, [{ email: string; displayName: string; preferredLocale: string; password: string }]>().mockResolvedValue(registeredUser);
  const refresh = jest.fn<Promise<TokenPair>, [{ refreshToken: string }]>().mockResolvedValue(tokenPair);
  const logout = jest.fn<Promise<void>, [string, { refreshToken: string }]>().mockResolvedValue(undefined);
  const changePassword = jest.fn<Promise<void>, [string, { currentPassword: string; newPassword: string }]>().mockResolvedValue(undefined);
  const limiter = { consume: jest.fn() };
  const operationLimiter = { consumeRegister: jest.fn(), consumeRefresh: jest.fn(), consumeChangePassword: jest.fn() };

  beforeEach(async () => {
    login.mockClear();
    register.mockClear();
    refresh.mockClear();
    logout.mockClear();
    changePassword.mockClear();
    limiter.consume.mockReset().mockReturnValue({ allowed: true });
    operationLimiter.consumeRegister.mockReset().mockReturnValue({ allowed: true });
    operationLimiter.consumeRefresh.mockReset().mockReturnValue({ allowed: true });
    operationLimiter.consumeChangePassword.mockReset().mockReturnValue({ allowed: true });
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { login, register, refresh, logout, changePassword } },
        { provide: LoginRateLimiter, useValue: limiter },
        { provide: AuthOperationRateLimiter, useValue: operationLimiter },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    const principal: AuthenticatedPrincipal = {
      id: '123e4567-e89b-12d3-a456-426614174000', email: 'user@example.test', displayName: 'User',
      preferredLocale: 'en', roles: [], permissions: [], organizationScopeIds: [], mustChangePassword: false,
    };
    app.use((request, _response, next) => {
      request.user = principal;
      next();
    });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new GlobalExceptionFilter(new RequestContext()));
    await app.init();
  });

  afterEach(async () => app.close());

  it('uses the global prefix, preserves DTO strings, and returns the exact token pair', async () => {
    const dto = { email: 'User@example.com', password: ' exact password ' };
    await request(app.getHttpServer()).post('/api/v1/auth/login').set('X-Forwarded-For', '198.51.100.7').send(dto).expect(200).expect(tokenPair);
    expect(limiter.consume).toHaveBeenCalledWith(dto.email, expect.any(String));
    expect(limiter.consume.mock.calls[0][1]).not.toBe('198.51.100.7');
    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith(dto);
  });

  it('registers publicly with 201, empty roles/scopes, and no tokens or password in the response', async () => {
    const dto = { email: 'new@example.test', displayName: 'New User', preferredLocale: 'en', password: 'twelvecharacters' };
    const response = await request(app.getHttpServer()).post('/api/v1/auth/register').send(dto).expect(201);
    expect(response.body).toEqual({
      id: registeredUser.id, email: registeredUser.email, displayName: registeredUser.displayName,
      preferredLocale: 'en', status: 'ACTIVE', roles: [], organizationScopeIds: [], mustChangePassword: false,
      createdAt: registeredUser.createdAt.toISOString(), updatedAt: registeredUser.updatedAt.toISOString(),
    });
    expect(response.body.accessToken).toBeUndefined();
    expect(response.body.refreshToken).toBeUndefined();
    expect(response.body.password).toBeUndefined();
    expect(response.body.passwordHash).toBeUndefined();
    expect(register).toHaveBeenCalledWith(dto);
  });

  it('rejects registration bodies with unknown fields', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/register').send({
      email: 'new@example.test', displayName: 'New User', preferredLocale: 'en', password: 'twelvecharacters',
      roles: ['SYSTEM_ADMIN'],
    }).expect(400);
    expect(register).not.toHaveBeenCalled();
  });

  it.each([
    ['short password', { email: 'a@example.test', displayName: 'A', preferredLocale: 'en', password: 'short' }],
    ['invalid email', { email: 'not-an-email', displayName: 'A', preferredLocale: 'en', password: 'twelvecharacters' }],
    ['invalid locale', { email: 'a@example.test', displayName: 'A', preferredLocale: 'fr', password: 'twelvecharacters' }],
    ['missing displayName', { email: 'a@example.test', preferredLocale: 'en', password: 'twelvecharacters' }],
  ])('rejects registration with %s', async (_label, body) => {
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(body).expect(400);
    expect(register).not.toHaveBeenCalled();
  });

  it('returns register 429 before calling the service', async () => {
    operationLimiter.consumeRegister.mockReturnValue({ allowed: false, retryAfterSeconds: 33 });
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: 'new@example.test', displayName: 'New User', preferredLocale: 'en', password: 'twelvecharacters' })
      .expect(429)
      .expect('Retry-After', '33')
      .expect({ code: 'RATE_LIMITED', message: 'Too many registration attempts', requestId: 'unknown' });
    expect(register).not.toHaveBeenCalled();
  });

  it('runs the limiter before auth and does not call auth when blocked', async () => {
    const calls: string[] = [];
    limiter.consume.mockImplementation(() => {
      calls.push('limiter');
      return { allowed: false, retryAfterSeconds: 42 };
    });
    login.mockImplementation(async () => {
      calls.push('auth');
      return tokenPair;
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'user@example.com', password: 'password' })
      .expect(429)
      .expect('Retry-After', '42')
      .expect({ code: 'RATE_LIMITED', message: 'Too many login attempts', requestId: 'unknown' });
    expect(calls).toEqual(['limiter']);
    expect(login).not.toHaveBeenCalled();
  });

  it('returns refresh 429 before calling the service', async () => {
    operationLimiter.consumeRefresh.mockReturnValue({ allowed: false, retryAfterSeconds: 17 });
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({ refreshToken: 'x'.repeat(20) })
      .expect(429).expect('Retry-After', '17')
      .expect({ code: 'RATE_LIMITED', message: 'Too many refresh attempts', requestId: 'unknown' });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('returns a successful refresh response and passes the exact DTO through', async () => {
    const dto = { refreshToken: ` ${'x'.repeat(20)} ` };
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').send(dto).expect(200).expect(tokenPair);
    expect(refresh).toHaveBeenCalledWith(dto);
  });

  it('returns password-change 429 before calling the service', async () => {
    operationLimiter.consumeChangePassword.mockReturnValue({ allowed: false, retryAfterSeconds: 23 });
    await request(app.getHttpServer()).post('/api/v1/auth/change-password')
      .send({ currentPassword: 'current', newPassword: 'new password exactly' })
      .expect(429).expect('Retry-After', '23')
      .expect({ code: 'RATE_LIMITED', message: 'Too many password change attempts', requestId: 'unknown' });
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('returns empty 204 responses for logout and password change', async () => {
    const refreshToken = 'x'.repeat(20);
    const logoutResponse = await request(app.getHttpServer()).post('/api/v1/auth/logout').send({ refreshToken }).expect(204);
    const passwordResponse = await request(app.getHttpServer()).post('/api/v1/auth/change-password')
      .send({ currentPassword: 'current', newPassword: 'new password exactly' }).expect(204);
    expect(logoutResponse.text).toBe('');
    expect(passwordResponse.text).toBe('');
    expect(logout).toHaveBeenCalledWith('123e4567-e89b-12d3-a456-426614174000', { refreshToken });
    expect(changePassword).toHaveBeenCalledWith(
      '123e4567-e89b-12d3-a456-426614174000',
      { currentPassword: 'current', newPassword: 'new password exactly' },
    );
  });
});

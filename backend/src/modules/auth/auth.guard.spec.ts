import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { RequestContext } from '../../common/request-context/request-context';
import { AuthGuard } from './auth.guard';
import type { AuthenticatedPrincipal } from './authenticated-principal';
import { AuthRepository } from './auth.repository';

const userId = '123e4567-e89b-12d3-a456-426614174000';
const principal: AuthenticatedPrincipal = {
  id: userId,
  email: 'user@example.test',
  displayName: 'User',
  preferredLocale: 'en',
  roles: ['TECHNICIAN'],
  permissions: ['jobs.read'],
  organizationScopeIds: ['org-1'],
  mustChangePassword: false,
};

function context(request: Request, response: Response, handler: object = {}): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as ExecutionContext;
}

describe('AuthGuard', () => {
  const secret = 'x'.repeat(32);
  let guard: AuthGuard;
  let requestContext: RequestContext;
  let repository: { findAuthenticatedPrincipal: jest.Mock };
  let response: Response;
  let setHeader: jest.Mock;

  beforeEach(() => {
    requestContext = new RequestContext();
    repository = { findAuthenticatedPrincipal: jest.fn().mockResolvedValue(principal) };
    setHeader = jest.fn();
    response = { setHeader } as unknown as Response;
    guard = new AuthGuard(
      new Reflector(),
      new JwtService({ secret, signOptions: { algorithm: 'HS256', issuer: 'wst-api', audience: 'wst-client' } }),
      new ConfigService({ auth: { jwtSecret: secret, issuer: 'wst-api', audience: 'wst-client' } }),
      repository as unknown as AuthRepository,
      requestContext,
    );
  });

  it('bypasses routes marked public', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const publicGuard = new AuthGuard(reflector, new JwtService(), new ConfigService(), repository as unknown as AuthRepository, requestContext);
    await expect(publicGuard.canActivate(context({ headers: {} } as Request, response))).resolves.toBe(true);
    expect(repository.findAuthenticatedPrincipal).not.toHaveBeenCalled();
  });

  it('verifies a real HS256 token, attaches request.user, and updates RequestContext', async () => {
    const token = await new JwtService({ secret, signOptions: { algorithm: 'HS256', issuer: 'wst-api', audience: 'wst-client', expiresIn: 600 } }).signAsync({ sub: userId });
    const request = { headers: { authorization: `Bearer ${token}` } } as Request;
    await requestContext.run({ requestId: 'request-1' }, async () => {
      await guard.canActivate(context(request, response));
      expect(request.user).toEqual(principal);
      expect(requestContext.getUserId()).toBe(userId);
      expect(requestContext.getRoles()).toEqual(['TECHNICIAN']);
      expect(requestContext.getScopes()).toEqual(['org-1']);
    });
  });

  it.each([
    ['missing header', undefined],
    ['malformed header', 'Basic token'],
  ])('rejects %s with the standard challenge', async (_name, authorization) => {
    await expect(guard.canActivate(context({ headers: { authorization } } as Request, response))).rejects.toMatchObject({ status: 401, message: 'Unauthenticated' });
    expect(setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer');
  });

  it.each([
    ['expired', { expiresIn: -1 }],
    ['wrong issuer', { issuer: 'other', expiresIn: 600 }],
    ['wrong audience', { audience: 'other', expiresIn: 600 }],
    ['wrong algorithm', { algorithm: 'HS384', expiresIn: 600 }],
    ['invalid UUID subject', { expiresIn: 600, sub: 'not-a-uuid' }],
  ])('rejects %s token', async (_name, options) => {
    const signing = new JwtService({
      secret,
      signOptions: {
        algorithm: options.algorithm === 'HS384' ? 'HS384' : 'HS256',
        issuer: options.issuer ?? 'wst-api',
        audience: options.audience ?? 'wst-client',
        expiresIn: options.expiresIn,
      },
    });
    const token = await signing.signAsync({ sub: options.sub ?? userId });
    await expect(guard.canActivate(context({ headers: { authorization: `Bearer ${token}` } } as Request, response))).rejects.toMatchObject({ status: 401 });
    expect(repository.findAuthenticatedPrincipal).not.toHaveBeenCalled();
  });

  it('preserves unexpected repository errors as server errors', async () => {
    repository.findAuthenticatedPrincipal.mockRejectedValue(new Error('database unavailable'));
    const token = await new JwtService({ secret, signOptions: { algorithm: 'HS256', issuer: 'wst-api', audience: 'wst-client', expiresIn: 600 } }).signAsync({ sub: userId });
    await expect(guard.canActivate(context({ headers: { authorization: `Bearer ${token}` } } as Request, response))).rejects.toThrow('database unavailable');
  });

  it.each(['missing', 'disabled'])('rejects a %s database user', async () => {
    repository.findAuthenticatedPrincipal.mockResolvedValue(null);
    const token = await new JwtService({ secret, signOptions: { algorithm: 'HS256', issuer: 'wst-api', audience: 'wst-client', expiresIn: 600 } }).signAsync({ sub: userId });
    await expect(guard.canActivate(context({ headers: { authorization: `Bearer ${token}` } } as Request, response))).rejects.toMatchObject({ status: 401, message: 'Unauthenticated' });
    expect(setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer');
  });
});

import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/auth/public.decorator';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { ErrorCode } from '../../common/errors/error-codes';
import { PublicCertificateVerificationController } from './public-certificate-verification.controller';

describe('PublicCertificateVerificationController', () => {
  const token = 'a'.repeat(43);
  const response = { certificateNumber: 'CERT-2026-000017' };

  function buildResponse() {
    return { setHeader: jest.fn() };
  }

  it('is marked @Public() and requires no permission (guard treats an absent decorator as pass-through)', () => {
    const reflector = new Reflector();
    const handler = Reflect.get(PublicCertificateVerificationController.prototype, 'verify') as Function;
    expect(reflector.get(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(reflector.get(PERMISSIONS_KEY, handler)).toBeUndefined();
  });

  it('delegates to verifyPublic when under the rate limit', async () => {
    const service = { verifyPublic: jest.fn().mockResolvedValue(response) };
    const rateLimiter = { consume: jest.fn().mockReturnValue({ allowed: true }) };
    const controller = new PublicCertificateVerificationController(service as never, rateLimiter as never);
    const request = { socket: { remoteAddress: '203.0.113.5' } } as never;
    const res = buildResponse();

    await expect(controller.verify(token, request, res as never)).resolves.toBe(response);
    expect(rateLimiter.consume).toHaveBeenCalledWith('203.0.113.5');
    expect(service.verifyPublic).toHaveBeenCalledWith(token);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('rejects with 429, sets Retry-After, and never calls the service once the per-IP limit is exceeded', () => {
    const service = { verifyPublic: jest.fn() };
    const rateLimiter = { consume: jest.fn().mockReturnValue({ allowed: false, retryAfterSeconds: 42 }) };
    const controller = new PublicCertificateVerificationController(service as never, rateLimiter as never);
    const request = { socket: { remoteAddress: '203.0.113.5' } } as never;
    const res = buildResponse();

    expect(() => controller.verify(token, request, res as never)).toThrow(
      expect.objectContaining({ statusCode: HttpStatus.TOO_MANY_REQUESTS, code: ErrorCode.RATE_LIMITED }),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '42');
    expect(service.verifyPublic).not.toHaveBeenCalled();
  });

  it('rate-limits by the connection\'s actual remote address, never a client-supplied forwarded header', async () => {
    const service = { verifyPublic: jest.fn().mockResolvedValue(response) };
    const rateLimiter = { consume: jest.fn().mockReturnValue({ allowed: true }) };
    const controller = new PublicCertificateVerificationController(service as never, rateLimiter as never);
    const request = { socket: { remoteAddress: '203.0.113.5' }, headers: { 'x-forwarded-for': '1.2.3.4' } } as never;

    await controller.verify(token, request, buildResponse() as never);
    expect(rateLimiter.consume).toHaveBeenCalledWith('203.0.113.5');
  });

  it('falls back to "unknown" when the socket address is unavailable, rather than throwing', async () => {
    const service = { verifyPublic: jest.fn().mockResolvedValue(response) };
    const rateLimiter = { consume: jest.fn().mockReturnValue({ allowed: true }) };
    const controller = new PublicCertificateVerificationController(service as never, rateLimiter as never);
    const request = { socket: {} } as never;

    await controller.verify(token, request, buildResponse() as never);
    expect(rateLimiter.consume).toHaveBeenCalledWith('unknown');
  });
});

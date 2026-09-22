import 'reflect-metadata';
import { BadRequestException, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/auth/public.decorator';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { AttachmentsController } from './attachments.controller';

describe('AttachmentsController', () => {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
  const attachmentId = '11111111-1111-4111-8111-111111111111';
  const authorizationId = '55555555-5555-4555-8555-555555555555';

  function makeResponse() {
    return { setHeader: jest.fn(), send: jest.fn() };
  }

  function makeRequest(remoteAddress: string | undefined, forwardedFor?: string) {
    return {
      socket: { remoteAddress },
      headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
    } as never;
  }

  function makeRateLimiter(overrides: Partial<Record<'consumeUpload' | 'consumeDownloadAuthorization' | 'consumeDownloadByIp', jest.Mock>> = {}) {
    return {
      consumeUpload: jest.fn().mockReturnValue({ allowed: true }),
      consumeDownloadAuthorization: jest.fn().mockReturnValue({ allowed: true }),
      consumeDownloadByIp: jest.fn().mockReturnValue({ allowed: true }),
      ...overrides,
    };
  }

  it('applies attachments.upload and rate-limits uploads with an integer Retry-After', async () => {
    const rateLimiter = makeRateLimiter();
    const service = { upload: jest.fn().mockResolvedValue({ id: attachmentId }) };
    const controller = new AttachmentsController(service as never, rateLimiter as never);
    const response = makeResponse();
    const file = { originalname: 'x.jpg' } as never;
    const dto = { purpose: 'JOB_PHOTO' } as never;

    await expect(controller.upload(file, dto, actor, response as never)).resolves.toEqual({ id: attachmentId });
    expect(service.upload).toHaveBeenCalledWith(file, dto, actor);

    rateLimiter.consumeUpload.mockReturnValue({ allowed: false, retryAfterSeconds: 42 });
    expect(() => controller.upload(file, dto, actor, response as never)).toThrow(
      expect.objectContaining({ statusCode: HttpStatus.TOO_MANY_REQUESTS }),
    );
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '42');

    const reflector = new Reflector();
    const handler = (name: string): Function => Reflect.get(AttachmentsController.prototype, name) as Function;
    expect(reflector.get(PERMISSIONS_KEY, handler('upload'))).toEqual(['attachments.upload']);
  });

  it('delegates get() and validates the attachmentId UUID', async () => {
    const service = { get: jest.fn().mockResolvedValue({ id: attachmentId }) };
    const controller = new AttachmentsController(service as never, makeRateLimiter() as never);
    await expect(controller.get(attachmentId, actor)).resolves.toEqual({ id: attachmentId });
    expect(service.get).toHaveBeenCalledWith(attachmentId, actor);
    await expect(
      new ParseUUIDPipe().transform('bad', { type: 'param', data: 'attachmentId', metatype: String }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rate-limits download authorizations independently of uploads and downloads', async () => {
    const rateLimiter = makeRateLimiter({ consumeDownloadAuthorization: jest.fn().mockReturnValue({ allowed: false, retryAfterSeconds: 7 }) });
    const service = { authorizeDownload: jest.fn() };
    const controller = new AttachmentsController(service as never, rateLimiter as never);
    const response = makeResponse();
    expect(() => controller.authorizeDownload(attachmentId, actor, response as never)).toThrow(
      expect.objectContaining({ statusCode: HttpStatus.TOO_MANY_REQUESTS }),
    );
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '7');
    expect(service.authorizeDownload).not.toHaveBeenCalled();
  });

  it('requires authentication (no @Public()) — the global AuthGuard enforces missing/invalid/expired Bearer tokens', () => {
    const reflector = new Reflector();
    const handler = Reflect.get(AttachmentsController.prototype, 'download') as Function;
    expect(reflector.get(IS_PUBLIC_KEY, handler)).toBeUndefined();
  });

  it('serves a valid download token as bytes for the authenticated caller passed through to the service', async () => {
    const service = {
      downloadByToken: jest.fn().mockResolvedValue({ buffer: Buffer.from('bytes'), contentType: 'image/jpeg', fileName: 'x.jpg' }),
    };
    const controller = new AttachmentsController(service as never, makeRateLimiter() as never);
    const response = makeResponse();
    const request = makeRequest('203.0.113.9');

    await controller.download(authorizationId, '10000', 'sig-value', actor, request, response as never);
    expect(service.downloadByToken).toHaveBeenCalledWith(authorizationId, '10000', 'sig-value', actor);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('x.jpg'));
    expect(response.send).toHaveBeenCalledWith(Buffer.from('bytes'));
    expect(JSON.stringify((response.send as jest.Mock).mock.calls[0][0])).not.toContain('object_storage_key');
  });

  it('returns 404 for an invalid, tampered, expired, or wrong-caller download token', async () => {
    const service = { downloadByToken: jest.fn().mockResolvedValue(null) };
    const controller = new AttachmentsController(service as never, makeRateLimiter() as never);
    const response = makeResponse();
    const request = makeRequest('203.0.113.9');
    await expect(controller.download(authorizationId, '10000', 'bad-sig', actor, request, response as never)).rejects.toMatchObject({ statusCode: 404 });
    expect(response.send).not.toHaveBeenCalled();
  });

  it('rate-limits the download route per remote IP with an integer Retry-After, before even asking the service', async () => {
    const rateLimiter = makeRateLimiter({ consumeDownloadByIp: jest.fn().mockReturnValue({ allowed: false, retryAfterSeconds: 13 }) });
    const service = { downloadByToken: jest.fn() };
    const controller = new AttachmentsController(service as never, rateLimiter as never);
    const response = makeResponse();
    const request = makeRequest('203.0.113.9');

    await expect(controller.download(authorizationId, '10000', 'sig', actor, request, response as never)).rejects.toMatchObject({
      statusCode: HttpStatus.TOO_MANY_REQUESTS, code: 'RATE_LIMITED',
    });
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '13');
    expect(Number.isInteger(13)).toBe(true);
    expect(service.downloadByToken).not.toHaveBeenCalled();
    expect(rateLimiter.consumeDownloadByIp).toHaveBeenCalledWith('203.0.113.9');
  });

  it('keys the per-IP rate limit on the socket remote address, never on a client-supplied X-Forwarded-For header', async () => {
    const rateLimiter = makeRateLimiter();
    const service = { downloadByToken: jest.fn().mockResolvedValue(null) };
    const controller = new AttachmentsController(service as never, rateLimiter as never);
    const response = makeResponse();
    // A client claims to be a different IP via X-Forwarded-For; the real socket address must win.
    const request = makeRequest('203.0.113.9', '9.9.9.9');

    await expect(controller.download(authorizationId, '10000', 'sig', actor, request, response as never)).rejects.toMatchObject({ statusCode: 404 });
    expect(rateLimiter.consumeDownloadByIp).toHaveBeenCalledWith('203.0.113.9');
    expect(rateLimiter.consumeDownloadByIp).not.toHaveBeenCalledWith('9.9.9.9');
  });

  it('escapes an attacker-supplied file name so it cannot inject a header or break out of the quoted value', async () => {
    const maliciousName = 'evil.jpg"; x-injected: 1\r\nSet-Cookie: a=b';
    const service = {
      downloadByToken: jest.fn().mockResolvedValue({ buffer: Buffer.from('x'), contentType: 'image/png', fileName: maliciousName }),
    };
    const controller = new AttachmentsController(service as never, makeRateLimiter() as never);
    const response = makeResponse();
    const request = makeRequest('203.0.113.9');
    await controller.download(authorizationId, '10000', 'sig', actor, request, response as never);
    const [, dispositionValue] = (response.setHeader as jest.Mock).mock.calls.find(([name]) => name === 'Content-Disposition') as [string, string];
    expect(dispositionValue).not.toContain('\r');
    expect(dispositionValue).not.toContain('\n');
    expect(dispositionValue.split('"').length).toBe(3); // exactly one opening + one closing quote around the ascii-safe filename
  });
});

import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { ExportsController } from './exports.controller';

describe('ExportsController', () => {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
  const exportJobId = '11111111-1111-4111-8111-111111111111';
  const authorizationId = '55555555-5555-4555-8555-555555555555';
  const reflector = new Reflector();
  const handler = (name: string): Function => Reflect.get(ExportsController.prototype, name) as Function;

  function makeResponse() {
    return { setHeader: jest.fn(), send: jest.fn() };
  }

  function makeRateLimiter(overrides: Partial<Record<'consumeCreate' | 'consumeDownloadAuthorization' | 'consumeDownloadByIp', jest.Mock>> = {}) {
    return {
      consumeCreate: jest.fn().mockReturnValue({ allowed: true }),
      consumeDownloadAuthorization: jest.fn().mockReturnValue({ allowed: true }),
      consumeDownloadByIp: jest.fn().mockReturnValue({ allowed: true }),
      ...overrides,
    };
  }

  it.each([
    ['list', 'exports.read'],
    ['create', 'exports.create'],
    ['get', 'exports.read'],
    ['authorizeDownload', 'exports.read'],
  ])('requires %s permission %s', (method, permission) => {
    expect(reflector.get(PERMISSIONS_KEY, handler(method))).toEqual([permission]);
  });

  it('create() rate-limits per user with an integer Retry-After and otherwise delegates to the service', async () => {
    const rateLimiter = makeRateLimiter();
    const service = { create: jest.fn().mockResolvedValue({ id: exportJobId, status: 'PENDING' }) };
    const controller = new ExportsController(service as never, rateLimiter as never);
    const response = makeResponse();
    const dto = { exportType: 'JOBS', format: 'CSV' } as never;

    await expect(controller.create(dto, actor, response as never)).resolves.toEqual({ id: exportJobId, status: 'PENDING' });
    expect(service.create).toHaveBeenCalledWith(dto, actor);

    rateLimiter.consumeCreate.mockReturnValue({ allowed: false, retryAfterSeconds: 7 });
    expect(() => controller.create(dto, actor, response as never)).toThrow(
      expect.objectContaining({ statusCode: HttpStatus.TOO_MANY_REQUESTS }),
    );
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '7');
  });

  it('authorizeDownload() rate-limits per user and otherwise delegates to the service', async () => {
    const rateLimiter = makeRateLimiter();
    const service = { authorizeDownload: jest.fn().mockResolvedValue({ url: 'http://x', expiresAt: '2026-01-01T00:00:00.000Z' }) };
    const controller = new ExportsController(service as never, rateLimiter as never);
    const response = makeResponse();

    await expect(controller.authorizeDownload(exportJobId, actor, response as never)).resolves.toEqual({
      url: 'http://x', expiresAt: '2026-01-01T00:00:00.000Z',
    });
    expect(service.authorizeDownload).toHaveBeenCalledWith(exportJobId, actor);

    rateLimiter.consumeDownloadAuthorization.mockReturnValue({ allowed: false, retryAfterSeconds: 3 });
    expect(() => controller.authorizeDownload(exportJobId, actor, response as never)).toThrow(
      expect.objectContaining({ statusCode: HttpStatus.TOO_MANY_REQUESTS }),
    );
  });

  it('download() streams the file with Content-Type/Content-Disposition set, and 404s when the token resolves to nothing', async () => {
    const rateLimiter = makeRateLimiter();
    const buffer = Buffer.from('a,b\n1,2\n');
    const service = { downloadByToken: jest.fn().mockResolvedValue({ buffer, contentType: 'text/csv; charset=utf-8', fileName: 'JOBS.csv' }) };
    const controller = new ExportsController(service as never, rateLimiter as never);
    const response = makeResponse();
    const request = { socket: { remoteAddress: '127.0.0.1' } } as never;

    await controller.download(authorizationId, '123', 'sig', actor, request, response as never);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(response.send).toHaveBeenCalledWith(buffer);

    (service.downloadByToken as jest.Mock).mockResolvedValue(null);
    await expect(
      controller.download(authorizationId, '123', 'sig', actor, request, makeResponse() as never),
    ).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND });
  });

  it('download() rate-limits per remote IP', async () => {
    const rateLimiter = makeRateLimiter({ consumeDownloadByIp: jest.fn().mockReturnValue({ allowed: false, retryAfterSeconds: 9 }) });
    const service = { downloadByToken: jest.fn() };
    const controller = new ExportsController(service as never, rateLimiter as never);
    const request = { socket: { remoteAddress: '127.0.0.1' } } as never;
    const response = makeResponse();
    await expect(controller.download(authorizationId, '123', 'sig', actor, request, response as never)).rejects.toMatchObject({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(service.downloadByToken).not.toHaveBeenCalled();
  });
});

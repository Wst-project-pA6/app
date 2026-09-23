import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { ErrorCode } from '../../common/errors/error-codes';
import { CertificatesController } from './certificates.controller';

describe('CertificatesController', () => {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
  const response = { id: 'certificate' };

  it('delegates every operation, passes the Idempotency-Key header through, and exposes exact, distinct issue/revoke permissions', async () => {
    const service = {
      list: jest.fn().mockResolvedValue(response),
      issue: jest.fn().mockResolvedValue(response),
      get: jest.fn().mockResolvedValue(response),
      revoke: jest.fn().mockResolvedValue(response),
    };
    const controller = new CertificatesController(service as never);
    const id = '11111111-1111-4111-8111-111111111111';
    const query = { page: 1, pageSize: 20 };
    const issueDto = { studentId: id, courseId: id } as never;
    const revokeDto = { reason: 'Fraudulent submission' } as never;

    await expect(controller.list(query, actor)).resolves.toBe(response);
    await expect(controller.create(issueDto, actor, 'a-valid-key-123')).resolves.toBe(response);
    await expect(controller.get(id, actor)).resolves.toBe(response);
    await expect(controller.revoke(id, revokeDto, actor)).resolves.toBe(response);

    expect(service.list).toHaveBeenCalledWith(query, actor);
    expect(service.issue).toHaveBeenCalledWith(issueDto, actor, 'a-valid-key-123');
    expect(service.get).toHaveBeenCalledWith(id, actor);
    expect(service.revoke).toHaveBeenCalledWith(id, revokeDto, actor);

    const reflector = new Reflector();
    const handler = (name: string): Function => Reflect.get(CertificatesController.prototype, name) as Function;
    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['training.read', 'students.self']);
    expect(reflector.get(PERMISSIONS_KEY, handler('create'))).toEqual(['certificates.issue']);
    expect(reflector.get(PERMISSIONS_KEY, handler('get'))).toEqual(['training.read', 'students.self']);
    expect(reflector.get(PERMISSIONS_KEY, handler('revoke'))).toEqual(['certificates.revoke']);
  });

  it('rejects an out-of-range Idempotency-Key header before ever calling the service', async () => {
    const service = { issue: jest.fn().mockResolvedValue(response) };
    const controller = new CertificatesController(service as never);
    const dto = { studentId: 'x', courseId: 'y' } as never;

    expect(() => controller.create(dto, actor, 'short')).toThrow(expect.objectContaining({ statusCode: HttpStatus.BAD_REQUEST, code: ErrorCode.BAD_REQUEST }));
    expect(() => controller.create(dto, actor, 'x'.repeat(200))).toThrow(expect.objectContaining({ code: ErrorCode.BAD_REQUEST }));
    expect(service.issue).not.toHaveBeenCalled();

    await controller.create(dto, actor, undefined);
    expect(service.issue).toHaveBeenCalledWith(dto, actor, undefined);
  });
});

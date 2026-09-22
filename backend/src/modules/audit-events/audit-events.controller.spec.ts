import 'reflect-metadata';
import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { AuditEventsController } from './audit-events.controller';

describe('AuditEventsController', () => {
  it('delegates to the service and requires audit.read', async () => {
    const response = { items: [], page: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } };
    const service = {
      list: jest.fn().mockResolvedValue(response),
      get: jest.fn().mockResolvedValue({ id: 'a1' }),
    };
    const controller = new AuditEventsController(service as never);
    const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
    const query = { page: 1, pageSize: 20 } as never;
    const auditEventId = '11111111-1111-4111-8111-111111111111';

    await expect(controller.list(query, actor)).resolves.toBe(response);
    expect(service.list).toHaveBeenCalledWith(query, actor);
    await expect(controller.get(auditEventId, actor)).resolves.toEqual({ id: 'a1' });
    expect(service.get).toHaveBeenCalledWith(auditEventId, actor);

    const reflector = new Reflector();
    expect(reflector.get(PERMISSIONS_KEY, AuditEventsController)).toEqual(['audit.read']);
  });

  it('validates the auditEventId UUID path parameter', async () => {
    await expect(
      new ParseUUIDPipe().transform('bad', { type: 'param', data: 'auditEventId', metatype: String }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

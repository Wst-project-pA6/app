import 'reflect-metadata';
import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { BaysController } from './bays.controller';

describe('BaysController', () => {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
  const response = { id: 'bay' };

  it('delegates every bay operation and exposes exact permissions', async () => {
    const service = {
      list: jest.fn().mockResolvedValue(response),
      create: jest.fn().mockResolvedValue(response),
      update: jest.fn().mockResolvedValue(response),
      calendar: jest.fn().mockResolvedValue(response),
    };
    const controller = new BaysController(service as never);
    const query = { page: 1, pageSize: 20 };
    const dto = { organizationScopeId: '22222222-2222-4222-8222-222222222222' } as never;
    const id = '11111111-1111-4111-8111-111111111111';
    await expect(controller.list(query, actor)).resolves.toBe(response);
    await expect(controller.create(dto, actor)).resolves.toBe(response);
    await expect(controller.update(id, dto, actor)).resolves.toBe(response);
    await expect(controller.calendar(id, { from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' }, actor)).resolves.toBe(response);
    expect(service.list).toHaveBeenCalledWith(query, actor);
    expect(service.create).toHaveBeenCalledWith(dto, actor);
    expect(service.update).toHaveBeenCalledWith(id, dto, actor);
    expect(service.calendar).toHaveBeenCalledWith(id, expect.anything(), actor);

    const reflector = new Reflector();
    const handler = (name: string): Function => Reflect.get(BaysController.prototype, name) as Function;
    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['bays.read']);
    expect(reflector.get(PERMISSIONS_KEY, handler('create'))).toEqual(['bays.manage']);
    expect(reflector.get(PERMISSIONS_KEY, handler('update'))).toEqual(['bays.manage']);
    expect(reflector.get(PERMISSIONS_KEY, handler('calendar'))).toEqual(['bays.read']);
  });

  it('validates bay UUID path parameters', async () => {
    await expect(new ParseUUIDPipe().transform('not-a-uuid', { type: 'param', data: 'bayId', metatype: String })).rejects.toBeInstanceOf(BadRequestException);
  });
});

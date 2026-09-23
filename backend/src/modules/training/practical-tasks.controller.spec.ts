import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { PracticalTasksController } from './practical-tasks.controller';

describe('PracticalTasksController', () => {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
  const response = { id: 'task' };

  it('delegates every operation and exposes exact permissions', async () => {
    const service = {
      list: jest.fn().mockResolvedValue(response),
      create: jest.fn().mockResolvedValue(response),
      update: jest.fn().mockResolvedValue(response),
    };
    const controller = new PracticalTasksController(service as never);
    const query = { page: 1, pageSize: 20 };
    const dto = { code: 'TASK-1', title: { en: 'Change oil' } } as never;
    const id = '11111111-1111-4111-8111-111111111111';
    await expect(controller.list(query, actor)).resolves.toBe(response);
    await expect(controller.create(dto, actor)).resolves.toBe(response);
    await expect(controller.update(id, dto, actor)).resolves.toBe(response);
    expect(service.list).toHaveBeenCalledWith(query, actor);
    expect(service.create).toHaveBeenCalledWith(dto, actor);
    expect(service.update).toHaveBeenCalledWith(id, dto, actor);

    const reflector = new Reflector();
    const handler = (name: string): Function => Reflect.get(PracticalTasksController.prototype, name) as Function;
    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['training.read']);
    expect(reflector.get(PERMISSIONS_KEY, handler('create'))).toEqual(['training.manage']);
    expect(reflector.get(PERMISSIONS_KEY, handler('update'))).toEqual(['training.manage']);
  });
});

import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { MentorsController } from './mentors.controller';

describe('MentorsController', () => {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
  const response = { items: [], page: {} };

  it('delegates to the service and exposes exact permissions', async () => {
    const service = { list: jest.fn().mockResolvedValue(response) };
    const controller = new MentorsController(service as never);
    const query = { page: 1, pageSize: 20 };
    await expect(controller.list(query, actor)).resolves.toBe(response);
    expect(service.list).toHaveBeenCalledWith(query, actor);

    const reflector = new Reflector();
    const handler = (name: string): Function => Reflect.get(MentorsController.prototype, name) as Function;
    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['training.read']);
  });
});

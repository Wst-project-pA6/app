import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { PredictionSettingsController } from './prediction-settings.controller';

describe('PredictionSettingsController', () => {
  const actor = { id: 'admin-1' } as never;
  const reflector = new Reflector();
  const handler = (name: string): Function => Reflect.get(PredictionSettingsController.prototype, name) as Function;

  it.each([
    ['get', ['config.read']],
    ['replace', ['config.manage']],
  ])('%s requires permission %s', (method, permissions) => {
    expect(reflector.get(PERMISSIONS_KEY, handler(method))).toEqual(permissions);
  });

  it('delegates to the service', async () => {
    const service = {
      get: jest.fn().mockResolvedValue({ version: 1 }),
      replace: jest.fn().mockResolvedValue({ version: 2 }),
    };
    const controller = new PredictionSettingsController(service as never);
    const dto = { version: 1, reorderLookbackWeeks: 8, mlServiceEnabled: true } as never;

    await expect(controller.get()).resolves.toEqual({ version: 1 });
    await expect(controller.replace(dto, actor)).resolves.toEqual({ version: 2 });
    expect(service.replace).toHaveBeenCalledWith(dto, actor);
  });
});

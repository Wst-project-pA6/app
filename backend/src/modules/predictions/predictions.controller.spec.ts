import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { PredictionsController } from './predictions.controller';

describe('PredictionsController', () => {
  const actor = { id: 'user-1' } as never;
  const predictionId = '11111111-1111-4111-8111-111111111111';
  const reflector = new Reflector();
  const handler = (name: string): Function => Reflect.get(PredictionsController.prototype, name) as Function;

  it.each([
    ['list', ['predictions.reorder.read', 'predictions.risk.read']],
    ['get', ['predictions.reorder.read', 'predictions.risk.read']],
    ['decide', ['predictions.reorder.decide', 'predictions.risk.decide']],
  ])('%s requires permissions %s', (method, permissions) => {
    expect(reflector.get(PERMISSIONS_KEY, handler(method))).toEqual(permissions);
  });

  it('delegates list/get/decide to the service with the query/param/body and actor', async () => {
    const service = {
      list: jest.fn().mockResolvedValue({ items: [] }),
      get: jest.fn().mockResolvedValue({ id: predictionId }),
      decide: jest.fn().mockResolvedValue({ id: predictionId, status: 'ACCEPTED' }),
    };
    const controller = new PredictionsController(service as never);
    const query = { page: 1, pageSize: 20 } as never;
    const dto = { decision: 'ACCEPTED' } as never;

    await expect(controller.list(query, actor)).resolves.toEqual({ items: [] });
    expect(service.list).toHaveBeenCalledWith(query, actor);

    await expect(controller.get(predictionId, actor)).resolves.toEqual({ id: predictionId });
    expect(service.get).toHaveBeenCalledWith(predictionId, actor);

    await expect(controller.decide(predictionId, dto, actor)).resolves.toEqual({ id: predictionId, status: 'ACCEPTED' });
    expect(service.decide).toHaveBeenCalledWith(predictionId, dto, actor);
  });
});

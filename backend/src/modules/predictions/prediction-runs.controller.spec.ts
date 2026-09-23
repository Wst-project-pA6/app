import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { PredictionRunsController } from './prediction-runs.controller';

describe('PredictionRunsController', () => {
  const actor = { id: 'user-1' } as never;
  const reflector = new Reflector();
  const handler = (name: string): Function => Reflect.get(PredictionRunsController.prototype, name) as Function;

  function makeResponse() {
    return { setHeader: jest.fn() };
  }

  it('requires predictions.reorder.decide or predictions.risk.decide', () => {
    expect(reflector.get(PERMISSIONS_KEY, handler('run'))).toEqual(['predictions.reorder.decide', 'predictions.risk.decide']);
  });

  it('rate-limits per user with an integer Retry-After and otherwise delegates to the service', async () => {
    const rateLimiter = { consumeRun: jest.fn().mockReturnValue({ allowed: true }) };
    const service = { run: jest.fn().mockResolvedValue({ id: 'run-1' }) };
    const controller = new PredictionRunsController(service as never, rateLimiter as never);
    const response = makeResponse();
    const dto = { type: 'REORDER_SUGGESTION' } as never;

    await expect(controller.run(dto, actor, response as never)).resolves.toEqual({ id: 'run-1' });
    expect(service.run).toHaveBeenCalledWith(dto, actor);

    rateLimiter.consumeRun.mockReturnValue({ allowed: false, retryAfterSeconds: 5 });
    expect(() => controller.run(dto, actor, response as never)).toThrow(
      expect.objectContaining({ statusCode: HttpStatus.TOO_MANY_REQUESTS }),
    );
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '5');
  });
});

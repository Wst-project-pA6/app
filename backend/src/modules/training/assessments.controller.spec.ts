import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { AssessmentsController } from './assessments.controller';

describe('AssessmentsController', () => {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
  const response = { id: 'assessment' };

  it('delegates every operation and exposes exact, distinct assess/sign-off permissions', async () => {
    const service = {
      list: jest.fn().mockResolvedValue(response),
      create: jest.fn().mockResolvedValue(response),
      update: jest.fn().mockResolvedValue(response),
      signOff: jest.fn().mockResolvedValue(response),
    };
    const controller = new AssessmentsController(service as never);
    const id = '11111111-1111-4111-8111-111111111111';
    const query = { page: 1, pageSize: 20 };
    const createDto = { sessionId: id, studentId: id, taskId: id, result: 'PASS', timeOnTaskMinutes: 10 } as never;
    const updateDto = { version: 1, changeReason: 'Correction' } as never;
    const signOffDto = { decision: 'SIGNED_OFF' } as never;

    await expect(controller.list(query, actor)).resolves.toBe(response);
    await expect(controller.create(createDto, actor)).resolves.toBe(response);
    await expect(controller.update(id, updateDto, actor)).resolves.toBe(response);
    await expect(controller.signOff(id, signOffDto, actor)).resolves.toBe(response);
    expect(service.list).toHaveBeenCalledWith(query, actor);
    expect(service.create).toHaveBeenCalledWith(createDto, actor);
    expect(service.update).toHaveBeenCalledWith(id, updateDto, actor);
    expect(service.signOff).toHaveBeenCalledWith(id, signOffDto, actor);

    const reflector = new Reflector();
    const handler = (name: string): Function => Reflect.get(AssessmentsController.prototype, name) as Function;
    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['training.read', 'students.self']);
    expect(reflector.get(PERMISSIONS_KEY, handler('create'))).toEqual(['training.assess']);
    expect(reflector.get(PERMISSIONS_KEY, handler('update'))).toEqual(['training.assess']);
    // Distinct from training.assess, per the frozen contract's separation-of-duties requirement.
    expect(reflector.get(PERMISSIONS_KEY, handler('signOff'))).toEqual(['training.signoff']);
  });
});

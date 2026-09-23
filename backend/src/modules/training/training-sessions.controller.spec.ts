import 'reflect-metadata';
import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { TrainingSessionsController } from './training-sessions.controller';

describe('TrainingSessionsController', () => {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
  const response = { id: 'session' };

  it('delegates every operation and exposes exact permissions', async () => {
    const service = {
      list: jest.fn().mockResolvedValue(response),
      create: jest.fn().mockResolvedValue(response),
      get: jest.fn().mockResolvedValue(response),
      update: jest.fn().mockResolvedValue(response),
      checkConflicts: jest.fn().mockResolvedValue(response),
      createOverrides: jest.fn().mockResolvedValue(response),
      transition: jest.fn().mockResolvedValue(response),
    };
    const controller = new TrainingSessionsController(service as never);
    const query = { page: 1, pageSize: 20 };
    const dto = { title: 'Session', courseId: '22222222-2222-4222-8222-222222222222' } as never;
    const overrideDto = { conflictKeys: ['BAY_JOB_CONFLICT-a'], reason: 'Approved by manager' } as never;
    const transitionDto = { toStatus: 'PUBLISHED' } as never;
    const id = '11111111-1111-4111-8111-111111111111';
    await expect(controller.list(query, actor)).resolves.toBe(response);
    await expect(controller.create(dto, actor)).resolves.toBe(response);
    await expect(controller.get(id, actor)).resolves.toBe(response);
    await expect(controller.update(id, dto, actor)).resolves.toBe(response);
    await expect(controller.checkConflicts(id, actor)).resolves.toBe(response);
    await expect(controller.createOverrides(id, overrideDto, actor)).resolves.toBe(response);
    await expect(controller.transition(id, transitionDto, actor)).resolves.toBe(response);
    expect(service.list).toHaveBeenCalledWith(query, actor);
    expect(service.create).toHaveBeenCalledWith(dto, actor);
    expect(service.get).toHaveBeenCalledWith(id, actor);
    expect(service.update).toHaveBeenCalledWith(id, dto, actor);
    expect(service.checkConflicts).toHaveBeenCalledWith(id, actor);
    expect(service.createOverrides).toHaveBeenCalledWith(id, overrideDto, actor);
    expect(service.transition).toHaveBeenCalledWith(id, transitionDto, actor);

    const reflector = new Reflector();
    const handler = (name: string): Function => Reflect.get(TrainingSessionsController.prototype, name) as Function;
    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['training.read', 'students.self']);
    expect(reflector.get(PERMISSIONS_KEY, handler('create'))).toEqual(['training.manage']);
    expect(reflector.get(PERMISSIONS_KEY, handler('get'))).toEqual(['training.read', 'students.self']);
    expect(reflector.get(PERMISSIONS_KEY, handler('update'))).toEqual(['training.manage']);
    expect(reflector.get(PERMISSIONS_KEY, handler('checkConflicts'))).toEqual(['training.manage', 'training.override-conflict']);
    expect(reflector.get(PERMISSIONS_KEY, handler('createOverrides'))).toEqual(['training.override-conflict']);
    expect(reflector.get(PERMISSIONS_KEY, handler('transition'))).toEqual(['training.publish', 'training.manage']);
  });

  it('validates session UUID path parameters', async () => {
    await expect(new ParseUUIDPipe().transform('not-a-uuid', { type: 'param', data: 'sessionId', metatype: String })).rejects.toBeInstanceOf(BadRequestException);
  });
});

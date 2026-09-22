import 'reflect-metadata';
import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { EnrollmentsController } from './enrollments.controller';

describe('EnrollmentsController', () => {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
  const response = { id: 'enrollment' };

  it('delegates every operation and exposes exact permissions', async () => {
    const service = {
      list: jest.fn().mockResolvedValue(response),
      create: jest.fn().mockResolvedValue(response),
      withdraw: jest.fn().mockResolvedValue(response),
    };
    const controller = new EnrollmentsController(service as never);
    const query = { page: 1, pageSize: 20 };
    const groupId = '11111111-1111-4111-8111-111111111111';
    const enrollmentId = '22222222-2222-4222-8222-222222222222';
    const createDto = { studentId: '33333333-3333-4333-8333-333333333333' } as never;
    const withdrawDto = { status: 'WITHDRAWN', reason: 'No longer attending' } as never;
    await expect(controller.list(groupId, query, actor)).resolves.toBe(response);
    await expect(controller.create(groupId, createDto, actor)).resolves.toBe(response);
    await expect(controller.withdraw(enrollmentId, withdrawDto, actor)).resolves.toBe(response);
    expect(service.list).toHaveBeenCalledWith(groupId, query, actor);
    expect(service.create).toHaveBeenCalledWith(groupId, createDto, actor);
    expect(service.withdraw).toHaveBeenCalledWith(enrollmentId, withdrawDto, actor);

    const reflector = new Reflector();
    const handler = (name: string): Function => Reflect.get(EnrollmentsController.prototype, name) as Function;
    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['training.read']);
    expect(reflector.get(PERMISSIONS_KEY, handler('create'))).toEqual(['training.manage']);
    expect(reflector.get(PERMISSIONS_KEY, handler('withdraw'))).toEqual(['training.manage']);
  });

  it('validates group and enrollment UUID path parameters', async () => {
    await expect(new ParseUUIDPipe().transform('not-a-uuid', { type: 'param', data: 'groupId', metatype: String })).rejects.toBeInstanceOf(BadRequestException);
    await expect(new ParseUUIDPipe().transform('not-a-uuid', { type: 'param', data: 'enrollmentId', metatype: String })).rejects.toBeInstanceOf(BadRequestException);
  });
});

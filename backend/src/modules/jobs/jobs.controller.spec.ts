import 'reflect-metadata';
import { BadRequestException, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { JobsController } from './jobs.controller';

describe('JobsController', () => {
  it('delegates job, assignment and checklist operations with contract permissions', async () => {
    const response = { id: 'job' };
    const service = {
      listTechnicians: jest.fn().mockResolvedValue(response), list: jest.fn().mockResolvedValue(response),
      create: jest.fn().mockResolvedValue(response), get: jest.fn().mockResolvedValue(response),
      update: jest.fn().mockResolvedValue(response), assign: jest.fn().mockResolvedValue(response),
      listWorkItems: jest.fn().mockResolvedValue(response), createWorkItem: jest.fn().mockResolvedValue(response),
      updateWorkItem: jest.fn().mockResolvedValue(response),
      transition: jest.fn().mockResolvedValue(response), listStageHistory: jest.fn().mockResolvedValue(response),
    };
    const controller = new JobsController(service as never);
    const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
    const id = '11111111-1111-4111-8111-111111111111';
    const dto = {} as never;
    await expect(controller.listTechnicians({ page: 1, pageSize: 20 }, actor)).resolves.toBe(response);
    await expect(controller.list({ page: 1, pageSize: 20 }, actor)).resolves.toBe(response);
    await expect(controller.create(dto, actor)).resolves.toBe(response);
    await expect(controller.get(id, actor)).resolves.toBe(response);
    await expect(controller.update(id, dto, actor)).resolves.toBe(response);
    await expect(controller.assign(id, dto, actor)).resolves.toBe(response);
    await expect(controller.listWorkItems(id, { page: 1, pageSize: 20 }, actor)).resolves.toBe(response);
    await expect(controller.createWorkItem(id, dto, actor)).resolves.toBe(response);
    await expect(controller.updateWorkItem(id, id, dto, actor)).resolves.toBe(response);
    await expect(controller.transition(id, dto, actor)).resolves.toBe(response);
    await expect(controller.listStageHistory(id, { page: 1, pageSize: 20 }, actor)).resolves.toBe(response);
    expect(service.assign).toHaveBeenCalledWith(id, dto, actor);
    expect(service.transition).toHaveBeenCalledWith(id, dto, actor);
    const reflector = new Reflector();
    const handler = (name: string): Function => Reflect.get(JobsController.prototype, name) as Function;
    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['jobs.read', 'jobs.read.assigned']);
    expect(reflector.get(PERMISSIONS_KEY, handler('listTechnicians'))).toEqual(['jobs.assign']);
    expect(reflector.get(PERMISSIONS_KEY, handler('create'))).toEqual(['jobs.create']);
    expect(reflector.get(PERMISSIONS_KEY, handler('get'))).toEqual(['jobs.read', 'jobs.read.assigned']);
    expect(reflector.get(PERMISSIONS_KEY, handler('update'))).toEqual(['jobs.update']);
    expect(reflector.get(PERMISSIONS_KEY, handler('assign'))).toEqual(['jobs.assign']);
    expect(reflector.get(PERMISSIONS_KEY, handler('listWorkItems'))).toEqual(['jobs.read', 'jobs.read.assigned']);
    expect(reflector.get(PERMISSIONS_KEY, handler('createWorkItem'))).toEqual(['jobs.update']);
    expect(reflector.get(PERMISSIONS_KEY, handler('updateWorkItem'))).toEqual(['labor.write', 'jobs.update']);
    expect(reflector.get(PERMISSIONS_KEY, handler('transition'))).toEqual([
      'jobs.transition.start', 'jobs.transition.submit-qc', 'quality.perform', 'jobs.transition.ready', 'jobs.transition.deliver',
    ]);
    expect(reflector.get(PERMISSIONS_KEY, handler('listStageHistory'))).toEqual(['jobs.read', 'jobs.read.assigned']);
    expect(reflector.get(HTTP_CODE_METADATA, handler('transition'))).toBe(HttpStatus.OK);
  });

  it('validates both UUID path parameters', async () => {
    await expect(new ParseUUIDPipe().transform('bad', { type: 'param', data: 'jobId', metatype: String })).rejects.toBeInstanceOf(BadRequestException);
    await expect(new ParseUUIDPipe().transform('bad', { type: 'param', data: 'workItemId', metatype: String })).rejects.toBeInstanceOf(BadRequestException);
  });
});

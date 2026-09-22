import 'reflect-metadata';
import { BadRequestException, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { LaborController } from './labor.controller';

describe('LaborController', () => {
  it('delegates to the service and applies the contract permissions', async () => {
    const response = { id: 'labor' };
    const service = {
      list: jest.fn().mockResolvedValue(response), create: jest.fn().mockResolvedValue(response),
      update: jest.fn().mockResolvedValue(response), void: jest.fn().mockResolvedValue(response),
    };
    const controller = new LaborController(service as never);
    const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
    const jobId = '11111111-1111-4111-8111-111111111111';
    const laborEntryId = '22222222-2222-4222-8222-222222222222';
    const dto = {} as never;
    await expect(controller.list(jobId, { page: 1, pageSize: 20 }, actor)).resolves.toBe(response);
    await expect(controller.create(jobId, dto, actor)).resolves.toBe(response);
    await expect(controller.update(jobId, laborEntryId, dto, actor)).resolves.toBe(response);
    await expect(controller.void(jobId, laborEntryId, dto, actor)).resolves.toBe(response);
    expect(service.update).toHaveBeenCalledWith(jobId, laborEntryId, dto, actor);
    expect(service.void).toHaveBeenCalledWith(jobId, laborEntryId, dto, actor);

    const reflector = new Reflector();
    const handler = (name: string): Function => Reflect.get(LaborController.prototype, name) as Function;
    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['labor.read']);
    expect(reflector.get(PERMISSIONS_KEY, handler('create'))).toEqual(['labor.write']);
    expect(reflector.get(PERMISSIONS_KEY, handler('update'))).toEqual(['labor.write']);
    expect(reflector.get(PERMISSIONS_KEY, handler('void'))).toEqual(['labor.write']);
    expect(reflector.get(HTTP_CODE_METADATA, handler('void'))).toBe(HttpStatus.OK);
    expect(reflector.get(HTTP_CODE_METADATA, handler('create'))).toBeUndefined();
  });

  it('validates both UUID path parameters', async () => {
    await expect(new ParseUUIDPipe().transform('bad', { type: 'param', data: 'jobId', metatype: String })).rejects.toBeInstanceOf(BadRequestException);
    await expect(new ParseUUIDPipe().transform('bad', { type: 'param', data: 'laborEntryId', metatype: String })).rejects.toBeInstanceOf(BadRequestException);
  });
});

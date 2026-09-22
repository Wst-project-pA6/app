import 'reflect-metadata';
import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { QualityController } from './quality.controller';

describe('QualityController', () => {
  it('delegates to the service and applies the contract permissions', async () => {
    const response = { id: 'qc' };
    const service = { list: jest.fn().mockResolvedValue(response), create: jest.fn().mockResolvedValue(response) };
    const controller = new QualityController(service as never);
    const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
    const jobId = '11111111-1111-4111-8111-111111111111';
    const dto = {} as never;
    await expect(controller.list(jobId, { page: 1, pageSize: 20 }, actor)).resolves.toBe(response);
    await expect(controller.create(jobId, dto, actor)).resolves.toBe(response);

    const reflector = new Reflector();
    const handler = (name: string): Function => Reflect.get(QualityController.prototype, name) as Function;
    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['jobs.read', 'jobs.read.assigned', 'quality.perform']);
    expect(reflector.get(PERMISSIONS_KEY, handler('create'))).toEqual(['quality.perform']);
  });

  it('validates the jobId UUID path parameter', async () => {
    await expect(new ParseUUIDPipe().transform('bad', { type: 'param', data: 'jobId', metatype: String })).rejects.toBeInstanceOf(BadRequestException);
  });
});

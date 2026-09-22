import 'reflect-metadata';
import { BadRequestException, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { ApprovalsController } from './approvals.controller';

describe('ApprovalsController', () => {
  it('delegates to the service and applies the contract permissions', async () => {
    const response = { id: 'approval' };
    const service = {
      list: jest.fn().mockResolvedValue(response),
      create: jest.fn().mockResolvedValue(response),
      decide: jest.fn().mockResolvedValue(response),
    };
    const controller = new ApprovalsController(service as never);
    const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
    const jobId = '11111111-1111-4111-8111-111111111111';
    const approvalId = '22222222-2222-4222-8222-222222222222';
    const dto = {} as never;
    await expect(controller.list(jobId, { page: 1, pageSize: 20 }, actor)).resolves.toBe(response);
    await expect(controller.create(jobId, dto, actor)).resolves.toBe(response);
    await expect(controller.decide(jobId, approvalId, dto, actor)).resolves.toBe(response);
    expect(service.decide).toHaveBeenCalledWith(jobId, approvalId, dto, actor);

    const reflector = new Reflector();
    const handler = (name: string): Function => Reflect.get(ApprovalsController.prototype, name) as Function;
    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['approvals.read']);
    expect(reflector.get(PERMISSIONS_KEY, handler('create'))).toEqual(['approvals.record']);
    expect(reflector.get(PERMISSIONS_KEY, handler('decide'))).toEqual(['approvals.record']);
    expect(reflector.get(HTTP_CODE_METADATA, handler('decide'))).toBe(HttpStatus.OK);
  });

  it('validates both UUID path parameters', async () => {
    await expect(new ParseUUIDPipe().transform('bad', { type: 'param', data: 'jobId', metatype: String })).rejects.toBeInstanceOf(BadRequestException);
    await expect(new ParseUUIDPipe().transform('bad', { type: 'param', data: 'approvalId', metatype: String })).rejects.toBeInstanceOf(BadRequestException);
  });
});

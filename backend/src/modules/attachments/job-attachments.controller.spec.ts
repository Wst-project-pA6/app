import 'reflect-metadata';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { JobAttachmentsController } from './job-attachments.controller';

describe('JobAttachmentsController', () => {
  it('delegates to the service and applies the contract permissions', async () => {
    const response = { items: [], page: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } };
    const service = {
      listForJob: jest.fn().mockResolvedValue(response),
      linkToJob: jest.fn().mockResolvedValue(response),
    };
    const controller = new JobAttachmentsController(service as never);
    const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
    const jobId = '11111111-1111-4111-8111-111111111111';
    const query = { page: 1, pageSize: 20 } as never;
    const dto = { attachmentIds: ['22222222-2222-4222-8222-222222222222'] } as never;

    await expect(controller.list(jobId, query, actor)).resolves.toBe(response);
    expect(service.listForJob).toHaveBeenCalledWith(jobId, query, actor);
    await expect(controller.link(jobId, dto, actor)).resolves.toBe(response);
    expect(service.linkToJob).toHaveBeenCalledWith(jobId, dto, actor);

    const reflector = new Reflector();
    const handler = (name: string): Function => Reflect.get(JobAttachmentsController.prototype, name) as Function;
    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['jobs.read', 'jobs.read.assigned']);
    expect(reflector.get(PERMISSIONS_KEY, handler('link'))).toEqual(['attachments.upload']);
    expect(reflector.get(HTTP_CODE_METADATA, handler('link'))).toBe(HttpStatus.OK);
  });
});

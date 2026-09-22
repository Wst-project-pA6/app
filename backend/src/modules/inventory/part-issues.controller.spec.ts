import 'reflect-metadata';
import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { ErrorCode } from '../../common/errors/error-codes';
import { PartIssueCreateRequest, PartIssueListQuery, PartIssueReversalRequest } from './dto/part-issue.dto';
import { PartIssuesController } from './part-issues.controller';
import { PartIssuesService } from './part-issues.service';

describe('PartIssuesController', () => {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
  const issueResponse = {
    id: 'issue-1',
    jobId: 'job-1',
    partId: 'part-1',
    partSku: 'BRK-001',
    storeId: 'store-1',
    quantity: 2,
    reversedQuantity: 0,
    status: 'ISSUED',
  };
  const listResponse = {
    items: [issueResponse],
    page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
  };
  const reversalResponse = {
    id: 'reversal-1',
    partIssueId: 'issue-1',
    quantity: 1,
    reason: 'Wrong part installed',
    reversedBy: actor.id,
    reversedAt: new Date(),
    stockMovementId: 'movement-2',
    partIssueStatus: 'PARTIALLY_REVERSED',
  };

  it('delegates operations to PartIssuesService and enforces exact permissions', async () => {
    const listMock = jest.fn().mockResolvedValue(listResponse);
    const issueMock = jest.fn().mockResolvedValue(issueResponse);
    const reverseMock = jest.fn().mockResolvedValue(reversalResponse);

    const service = { list: listMock, issue: issueMock, reverse: reverseMock } as unknown as PartIssuesService;
    const controller = new PartIssuesController(service);

    const jobId = '11111111-1111-4111-8111-111111111111';
    const partIssueId = '22222222-2222-4222-8222-222222222222';
    const query: PartIssueListQuery = { page: 1, pageSize: 20 };
    const createDto: PartIssueCreateRequest = {
      partId: '33333333-3333-4333-8333-333333333333',
      storeId: '44444444-4444-4444-8444-444444444444',
      quantity: 2,
    };
    const reversalDto: PartIssueReversalRequest = { quantity: 1, reason: 'Wrong part installed' };

    await expect(controller.list(jobId, query, actor)).resolves.toBe(listResponse);
    await expect(controller.issue(jobId, createDto, actor, 'valid-idempotency-key-123')).resolves.toBe(issueResponse);
    await expect(controller.reverse(jobId, partIssueId, reversalDto, actor, undefined)).resolves.toBe(reversalResponse);

    expect(listMock.mock.calls).toEqual([[jobId, query, actor]]);
    expect(issueMock.mock.calls).toEqual([[jobId, createDto, actor, 'valid-idempotency-key-123']]);
    expect(reverseMock.mock.calls).toEqual([[jobId, partIssueId, reversalDto, actor, undefined]]);

    const reflector = new Reflector();
    const handler = (name: string): Function => Reflect.get(PartIssuesController.prototype, name) as Function;

    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual([
      'inventory.read',
      'inventory.issue',
      'inventory.reverse',
    ]);
    expect(reflector.get(PERMISSIONS_KEY, handler('issue'))).toEqual(['inventory.issue']);
    expect(reflector.get(PERMISSIONS_KEY, handler('reverse'))).toEqual(['inventory.reverse']);

    // Both POST endpoints keep Nest's default 201 status (no @HttpCode override)
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler('issue'))).toBeUndefined();
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler('reverse'))).toBeUndefined();
  });

  it('validates jobId and partIssueId UUID path parameters', async () => {
    const pipe = new ParseUUIDPipe();
    await expect(
      pipe.transform('invalid-uuid', { type: 'param', data: 'jobId', metatype: String }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform('invalid-uuid', { type: 'param', data: 'partIssueId', metatype: String }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates Idempotency-Key length on issue', () => {
    const controller = new PartIssuesController({} as PartIssuesService);
    const createDto: PartIssueCreateRequest = {
      partId: '33333333-3333-4333-8333-333333333333',
      storeId: '44444444-4444-4444-8444-444444444444',
      quantity: 2,
    };

    expect(() => controller.issue('11111111-1111-4111-8111-111111111111', createDto, actor, 'short')).toThrow(
      expect.objectContaining({ code: ErrorCode.BAD_REQUEST }),
    );
    expect(() =>
      controller.issue('11111111-1111-4111-8111-111111111111', createDto, actor, 'a'.repeat(129)),
    ).toThrow(expect.objectContaining({ code: ErrorCode.BAD_REQUEST }));
  });

  it('validates Idempotency-Key length on reverse', () => {
    const controller = new PartIssuesController({} as PartIssuesService);
    const reversalDto: PartIssueReversalRequest = { quantity: 1, reason: 'Wrong part installed' };

    expect(() =>
      controller.reverse(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        reversalDto,
        actor,
        'short',
      ),
    ).toThrow(expect.objectContaining({ code: ErrorCode.BAD_REQUEST }));
  });
});

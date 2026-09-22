import 'reflect-metadata';
import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { ErrorCode } from '../../common/errors/error-codes';
import {
  StockAdjustmentCreateRequest,
  StockAdjustmentDecision,
  StockAdjustmentDecisionRequest,
  StockAdjustmentListQuery,
  StockAdjustmentReasonCode,
  StockAdjustmentStatus,
} from './dto/stock-adjustment.dto';
import { StockAdjustmentsController } from './stock-adjustments.controller';
import { StockAdjustmentsService } from './stock-adjustments.service';

describe('StockAdjustmentsController', () => {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
  const sampleAdjustmentResponse = {
    id: 'adj-1',
    storeId: 'store-1',
    partId: 'part-1',
    quantityDelta: 5,
    reasonCode: StockAdjustmentReasonCode.FOUND,
    status: StockAdjustmentStatus.PENDING_APPROVAL,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: actor.id,
    updatedBy: actor.id,
  };
  const listResponse = {
    items: [sampleAdjustmentResponse],
    page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
  };

  it('delegates operations to StockAdjustmentsService and enforces exact permissions', async () => {
    const listMock = jest.fn().mockResolvedValue(listResponse);
    const createMock = jest.fn().mockResolvedValue(sampleAdjustmentResponse);
    const decideMock = jest.fn().mockResolvedValue({
      ...sampleAdjustmentResponse,
      status: StockAdjustmentStatus.APPROVED,
    });

    const service = {
      list: listMock,
      create: createMock,
      decide: decideMock,
    } as unknown as StockAdjustmentsService;
    const controller = new StockAdjustmentsController(service);

    const adjustmentId = '11111111-1111-4111-8111-111111111111';
    const query: StockAdjustmentListQuery = { page: 1, pageSize: 20 };
    const createDto: StockAdjustmentCreateRequest = {
      storeId: '22222222-2222-4222-8222-222222222222',
      partId: '33333333-3333-4333-8333-333333333333',
      quantityDelta: 5,
      reasonCode: StockAdjustmentReasonCode.FOUND,
      note: 'Found in back',
    };
    const decisionDto: StockAdjustmentDecisionRequest = {
      decision: StockAdjustmentDecision.APPROVED,
      reason: 'Approved after verification',
    };

    await expect(controller.list(query, actor)).resolves.toBe(listResponse);
    await expect(
      controller.create(createDto, actor, 'valid-idempotency-key-123'),
    ).resolves.toBe(sampleAdjustmentResponse);
    await expect(controller.decide(adjustmentId, decisionDto, actor)).resolves.toMatchObject({
      status: StockAdjustmentStatus.APPROVED,
    });

    expect(listMock).toHaveBeenCalledWith(query, actor);
    expect(createMock).toHaveBeenCalledWith(createDto, actor, 'valid-idempotency-key-123');
    expect(decideMock).toHaveBeenCalledWith(adjustmentId, decisionDto, actor);

    const reflector = new Reflector();
    const handler = (name: string): Function =>
      Reflect.get(StockAdjustmentsController.prototype, name) as Function;

    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual([
      'inventory.adjust',
      'inventory.adjust.approve',
      'inventory.read',
    ]);
    expect(reflector.get(PERMISSIONS_KEY, handler('create'))).toEqual(['inventory.adjust']);
    expect(reflector.get(PERMISSIONS_KEY, handler('decide'))).toEqual(['inventory.adjust.approve']);

    // POST create explicitly returns HTTP 201
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler('create'))).toBe(201);
    // POST decide explicitly returns HTTP 200
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler('decide'))).toBe(200);
  });

  it('validates adjustmentId UUID path parameter', async () => {
    const pipe = new ParseUUIDPipe();
    await expect(
      pipe.transform('invalid-uuid', { type: 'param', data: 'adjustmentId', metatype: String }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform('11111111-1111-4111-8111-111111111111', {
        type: 'param',
        data: 'adjustmentId',
        metatype: String,
      }),
    ).resolves.toBe('11111111-1111-4111-8111-111111111111');
  });

  it('validates Idempotency-Key length on create', async () => {
    const createMock = jest.fn().mockResolvedValue(sampleAdjustmentResponse);
    const service = { create: createMock } as unknown as StockAdjustmentsService;
    const controller = new StockAdjustmentsController(service);
    const createDto: StockAdjustmentCreateRequest = {
      storeId: '22222222-2222-4222-8222-222222222222',
      partId: '33333333-3333-4333-8333-333333333333',
      quantityDelta: 5,
      reasonCode: StockAdjustmentReasonCode.FOUND,
    };

    // < 8 chars throws BAD_REQUEST
    expect(() => controller.create(createDto, actor, 'short')).toThrow(
      expect.objectContaining({ code: ErrorCode.BAD_REQUEST }),
    );
    // > 128 chars throws BAD_REQUEST
    expect(() => controller.create(createDto, actor, 'a'.repeat(129))).toThrow(
      expect.objectContaining({ code: ErrorCode.BAD_REQUEST }),
    );

    // 8 chars and 128 chars are valid
    await expect(controller.create(createDto, actor, 'a'.repeat(8))).resolves.toBeDefined();
    await expect(controller.create(createDto, actor, 'a'.repeat(128))).resolves.toBeDefined();
    // undefined is valid (optional header)
    await expect(controller.create(createDto, actor, undefined)).resolves.toBeDefined();
  });
});

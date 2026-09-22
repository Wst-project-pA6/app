import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseApprovalsService } from './purchase-approvals.service';
import { GoodsReceiptsService } from './goods-receipts.service';

describe('PurchaseOrdersController', () => {
  let controller: PurchaseOrdersController;
  let poServiceMock: {
    list: jest.Mock;
    create: jest.Mock;
    getById: jest.Mock;
    update: jest.Mock;
    transition: jest.Mock;
  };
  let approvalsServiceMock: {
    list: jest.Mock;
    decide: jest.Mock;
  };
  let receiptsServiceMock: {
    list: jest.Mock;
    create: jest.Mock;
  };

  const mockActor: AuthenticatedPrincipal = {
    id: 'user-1',
    roles: ['PARTS_SPECIALIST'],
    permissions: [
      'purchasing.read',
      'purchasing.create',
      'purchasing.approve',
      'purchasing.receive',
    ],
    email: 'user@test.com',
    authTime: new Date(),
    organizationScopeIds: ['scope-1'],
    displayName: 'User 1',
    preferredLocale: 'en',
    mustChangePassword: false,
  };

  beforeEach(async () => {
    poServiceMock = {
      list: jest.fn(),
      create: jest.fn(),
      getById: jest.fn(),
      update: jest.fn(),
      transition: jest.fn(),
    };
    approvalsServiceMock = {
      list: jest.fn(),
      decide: jest.fn(),
    };
    receiptsServiceMock = {
      list: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PurchaseOrdersController],
      providers: [
        { provide: PurchaseOrdersService, useValue: poServiceMock },
        { provide: PurchaseApprovalsService, useValue: approvalsServiceMock },
        { provide: GoodsReceiptsService, useValue: receiptsServiceMock },
      ],
    }).compile();

    controller = module.get<PurchaseOrdersController>(PurchaseOrdersController);
  });

  it('declares exact permissions for all 9 purchase order operations', () => {
    const reflector = new Reflector();
    const handler = (name: string): ((...args: unknown[]) => unknown) =>
      Reflect.get(PurchaseOrdersController.prototype, name) as (...args: unknown[]) => unknown;

    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['purchasing.read']);
    expect(reflector.get(PERMISSIONS_KEY, handler('create'))).toEqual(['purchasing.create']);
    expect(reflector.get(PERMISSIONS_KEY, handler('getById'))).toEqual(['purchasing.read']);
    expect(reflector.get(PERMISSIONS_KEY, handler('update'))).toEqual(['purchasing.create']);
    expect(reflector.get(PERMISSIONS_KEY, handler('transition'))).toEqual(['purchasing.create']);
    expect(reflector.get(PERMISSIONS_KEY, handler('listApprovals'))).toEqual(['purchasing.read']);
    expect(reflector.get(PERMISSIONS_KEY, handler('decide'))).toEqual(['purchasing.approve']);
    expect(reflector.get(PERMISSIONS_KEY, handler('listGoodsReceipts'))).toEqual(['purchasing.read']);
    expect(reflector.get(PERMISSIONS_KEY, handler('createGoodsReceipt'))).toEqual(['purchasing.receive']);
  });

  it('declares exact HTTP 200/201 status code metadata', () => {
    const handler = (name: string): ((...args: unknown[]) => unknown) =>
      Reflect.get(PurchaseOrdersController.prototype, name) as (...args: unknown[]) => unknown;

    // In NestJS, @HttpCode stores code in '__httpCode__' metadata
    expect(Reflect.getMetadata('__httpCode__', handler('create'))).toBe(201);
    expect(Reflect.getMetadata('__httpCode__', handler('transition'))).toBe(200);
    expect(Reflect.getMetadata('__httpCode__', handler('decide'))).toBe(201);
    expect(Reflect.getMetadata('__httpCode__', handler('createGoodsReceipt'))).toBe(201);
  });

  it('has no forbidden extra action routes', () => {
    const propertyNames = Object.getOwnPropertyNames(PurchaseOrdersController.prototype);
    expect(propertyNames).not.toContain('submit');
    expect(propertyNames).not.toContain('order');
    expect(propertyNames).not.toContain('cancel');
  });

  it('rejects invalid Idempotency-Key length (<8 chars)', async () => {
    await expect(
      controller.createGoodsReceipt(
        'po-1',
        { lines: [] },
        'short',
        mockActor,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: ErrorCode.BAD_REQUEST,
    });
  });

  it('delegates transition call to service', async () => {
    const fakeResponse = { id: 'po-1', status: 'PENDING_APPROVAL' };
    poServiceMock.transition.mockResolvedValue(fakeResponse);

    const result = await controller.transition(
      'po-1',
      { toStatus: 'PENDING_APPROVAL' },
      mockActor,
    );
    expect(result).toEqual(fakeResponse);
    expect(poServiceMock.transition).toHaveBeenCalledWith(
      'po-1',
      { toStatus: 'PENDING_APPROVAL' },
      mockActor,
    );
  });
});

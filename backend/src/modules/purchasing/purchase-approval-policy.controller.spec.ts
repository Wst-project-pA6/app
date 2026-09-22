import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { PurchaseApprovalPolicyController } from './purchase-approval-policy.controller';
import { PurchaseApprovalPolicyService } from './purchase-approval-policy.service';

describe('PurchaseApprovalPolicyController', () => {
  let controller: PurchaseApprovalPolicyController;
  let getPolicyMock: jest.Mock;
  let replacePolicyMock: jest.Mock;

  const mockActor: AuthenticatedPrincipal = {
    id: 'user-1',
    roles: ['DIRECTOR'],
    permissions: ['config.manage', 'config.read', 'purchasing.read'],
    email: 'admin@test.com',
    authTime: new Date(),
    organizationScopeIds: [],
    displayName: 'Admin',
    preferredLocale: 'en',
    mustChangePassword: false,
  };

  beforeEach(async () => {
    getPolicyMock = jest.fn();
    replacePolicyMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PurchaseApprovalPolicyController],
      providers: [
        {
          provide: PurchaseApprovalPolicyService,
          useValue: {
            getPolicy: getPolicyMock,
            replacePolicy: replacePolicyMock,
          },
        },
      ],
    }).compile();

    controller = module.get<PurchaseApprovalPolicyController>(PurchaseApprovalPolicyController);
  });

  it('declares exact permissions for policy endpoints', () => {
    const reflector = new Reflector();
    const handler = (name: string): ((...args: unknown[]) => unknown) =>
      Reflect.get(PurchaseApprovalPolicyController.prototype, name) as (...args: unknown[]) => unknown;

    expect(reflector.get(PERMISSIONS_KEY, handler('getPolicy'))).toEqual(['config.read', 'purchasing.read']);
    expect(reflector.get(PERMISSIONS_KEY, handler('replacePolicy'))).toEqual(['config.manage']);
  });

  it('delegates getPolicy', async () => {
    const expected = {
      version: 1,
      currencyCode: 'SAR',
      tiers: [{ minimumTotal: '0.0000', requiredApprovals: 1 as const }],
      updatedAt: '2026-09-01T00:00:00.000Z',
      updatedBy: null,
    };
    getPolicyMock.mockResolvedValue(expected);

    const res = await controller.getPolicy();
    expect(res).toEqual(expected);
    expect(getPolicyMock).toHaveBeenCalled();
  });

  it('delegates replacePolicy', async () => {
    const dto = {
      version: 1,
      tiers: [{ minimumTotal: '0.0000', requiredApprovals: 1 as const }],
    };
    const expected = {
      version: 2,
      currencyCode: 'SAR',
      tiers: dto.tiers,
      updatedAt: '2026-09-02T00:00:00.000Z',
      updatedBy: 'user-1',
    };
    replacePolicyMock.mockResolvedValue(expected);

    const res = await controller.replacePolicy(dto, mockActor);
    expect(res).toEqual(expected);
    expect(replacePolicyMock).toHaveBeenCalledWith(dto, mockActor);
  });
});

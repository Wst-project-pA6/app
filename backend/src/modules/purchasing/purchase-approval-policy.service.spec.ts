import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { PurchaseApprovalPolicyRepository } from './purchase-approval-policy.repository';
import { PurchaseApprovalPolicyService } from './purchase-approval-policy.service';

describe('PurchaseApprovalPolicyService', () => {
  let service: PurchaseApprovalPolicyService;
  let repoMock: jest.Mocked<Partial<PurchaseApprovalPolicyRepository>>;
  let auditMock: jest.Mocked<Partial<AuditService>>;
  let runInTransactionMock: jest.Mock;

  const mockActor: AuthenticatedPrincipal = {
    id: 'user-1',
    roles: ['DIRECTOR'],
    permissions: ['config.manage', 'config.read', 'purchasing.read'],
    email: 'admin@test.com',
    authTime: new Date(),
    organizationScopeIds: [],
    displayName: 'Admin User',
    preferredLocale: 'en',
    mustChangePassword: false,
  };

  beforeEach(async () => {
    repoMock = {
      getPolicy: jest.fn(),
      lockPolicy: jest.fn(),
      replaceTiersAndUpdate: jest.fn(),
    };
    auditMock = {
      record: jest.fn(),
    };
    runInTransactionMock = jest.fn(async (cb: (client: any) => Promise<any>) => cb({}));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseApprovalPolicyService,
        { provide: PurchaseApprovalPolicyRepository, useValue: repoMock },
        {
          provide: DatabaseService,
          useValue: { runInTransaction: runInTransactionMock },
        },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<PurchaseApprovalPolicyService>(PurchaseApprovalPolicyService);
  });

  it('retrieves the active singleton policy', async () => {
    repoMock.getPolicy = jest.fn().mockResolvedValue({
      policy: {
        id: true,
        version: 1,
        currency_code: 'SAR',
        updated_at: new Date('2026-09-01T00:00:00Z'),
        updated_by: 'user-1',
      },
      tiers: [
        { id: 'tier-1', policy_id: true, minimum_total: '0.0000', required_approvals: 1 },
      ],
    });

    const result = await service.getPolicy();
    expect(result.version).toBe(1);
    expect(result.currencyCode).toBe('SAR');
    expect(result.tiers.length).toBe(1);
    expect(result.tiers[0].minimumTotal).toBe('0.0000');
    expect(result.tiers[0].requiredApprovals).toBe(1);
  });

  it('throws 404 NOT_FOUND when the singleton policy is missing', async () => {
    repoMock.getPolicy = jest.fn().mockResolvedValue({
      policy: null,
      tiers: [],
    });

    await expect(service.getPolicy()).rejects.toMatchObject({
      statusCode: 404,
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('rejects PUT when the first tier does not start at 0', async () => {
    await expect(
      service.replacePolicy(
        {
          version: 1,
          tiers: [{ minimumTotal: '100.0000', requiredApprovals: 1 }],
        },
        mockActor,
      ),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: ErrorCode.VALIDATION_FAILED,
    });
  });

  it('rejects PUT when tiers are not strictly ascending', async () => {
    await expect(
      service.replacePolicy(
        {
          version: 1,
          tiers: [
            { minimumTotal: '0.0000', requiredApprovals: 1 },
            { minimumTotal: '5000.0000', requiredApprovals: 2 },
            { minimumTotal: '3000.0000', requiredApprovals: 2 },
          ],
        },
        mockActor,
      ),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: ErrorCode.VALIDATION_FAILED,
    });
  });

  it('throws 409 VERSION_CONFLICT when version is stale', async () => {
    repoMock.lockPolicy = jest.fn().mockResolvedValue({
      id: true,
      version: 2,
      currency_code: 'SAR',
      updated_at: new Date(),
      updated_by: null,
    });

    await expect(
      service.replacePolicy(
        {
          version: 1,
          tiers: [{ minimumTotal: '0.0000', requiredApprovals: 1 }],
        },
        mockActor,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCode.VERSION_CONFLICT,
    });
  });

  it('successfully updates policy, increments version, and audits', async () => {
    repoMock.lockPolicy = jest.fn().mockResolvedValue({
      id: true,
      version: 1,
      currency_code: 'SAR',
      updated_at: new Date(),
      updated_by: null,
    });

    repoMock.replaceTiersAndUpdate = jest.fn().mockResolvedValue({
      policy: {
        id: true,
        version: 2,
        currency_code: 'SAR',
        updated_at: new Date('2026-09-02T00:00:00Z'),
        updated_by: 'user-1',
      },
      tiers: [
        { id: 'tier-1', policy_id: true, minimum_total: '0.0000', required_approvals: 1 },
        { id: 'tier-2', policy_id: true, minimum_total: '5000.0000', required_approvals: 2 },
      ],
    });

    const result = await service.replacePolicy(
      {
        version: 1,
        tiers: [
          { minimumTotal: '0.0000', requiredApprovals: 1 },
          { minimumTotal: '5000.0000', requiredApprovals: 2 },
        ],
      },
      mockActor,
    );

    expect(result.version).toBe(2);
    expect(result.currencyCode).toBe('SAR');
    expect(result.tiers.length).toBe(2);
    expect(auditMock.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'CONFIG.PURCHASE_POLICY.UPDATE',
        outcome: 'SUCCESS',
      }),
    );
  });
});

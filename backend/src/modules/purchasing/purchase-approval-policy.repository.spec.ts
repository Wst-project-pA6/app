import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../common/database/database.service';
import { PurchaseApprovalPolicyRepository } from './purchase-approval-policy.repository';

describe('PurchaseApprovalPolicyRepository', () => {
  let repository: PurchaseApprovalPolicyRepository;
  let queryMock: jest.Mock;

  beforeEach(async () => {
    queryMock = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseApprovalPolicyRepository,
        {
          provide: DatabaseService,
          useValue: {
            getPool: () => ({ query: queryMock }),
          },
        },
      ],
    }).compile();

    repository = module.get<PurchaseApprovalPolicyRepository>(PurchaseApprovalPolicyRepository);
  });

  it('retrieves the global singleton policy and tiers', async () => {
    const policyRow = {
      id: true,
      version: 1,
      currency_code: 'SAR',
      updated_at: new Date(),
      updated_by: null,
    };
    const tierRows = [
      { id: 'tier-1', policy_id: true, minimum_total: '0.0000', required_approvals: 1 },
      { id: 'tier-2', policy_id: true, minimum_total: '5000.0000', required_approvals: 2 },
    ];

    queryMock
      .mockResolvedValueOnce({ rows: [policyRow] })
      .mockResolvedValueOnce({ rows: tierRows });

    const result = await repository.getPolicy();
    expect(result.policy).toEqual(policyRow);
    expect(result.tiers).toEqual(tierRows);
  });

  it('returns null policy when singleton row is missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const result = await repository.getPolicy();
    expect(result.policy).toBeNull();
    expect(result.tiers).toEqual([]);
  });

  it('locks singleton policy row FOR UPDATE', async () => {
    const clientQueryMock = jest.fn().mockResolvedValue({
      rows: [{ id: true, version: 1, currency_code: 'SAR' }],
    });
    const client = { query: clientQueryMock } as any;

    const locked = await repository.lockPolicy(client);
    expect(locked?.version).toBe(1);
    expect(clientQueryMock).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'));
  });

  it('replaces tiers and updates version transactionally', async () => {
    const clientQueryMock = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // DELETE
      .mockResolvedValueOnce({ rows: [] }) // INSERT tier 1
      .mockResolvedValueOnce({
        rows: [{ id: true, version: 2, currency_code: 'SAR', updated_at: new Date(), updated_by: 'user-1' }],
      }) // UPDATE policy
      .mockResolvedValueOnce({
        rows: [{ id: 'tier-1', policy_id: true, minimum_total: '0.0000', required_approvals: 1 }],
      }); // SELECT tiers

    const client = { query: clientQueryMock } as any;
    const result = await repository.replaceTiersAndUpdate(client, 'user-1', [
      { minimumTotal: '0.0000', requiredApprovals: 1 },
    ]);

    expect(result.policy.version).toBe(2);
    expect(result.tiers.length).toBe(1);
    expect(clientQueryMock).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM purchase_approval_tiers'));
  });
});

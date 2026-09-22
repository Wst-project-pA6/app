import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { PurchaseApprovalsService } from './purchase-approvals.service';
import { PurchaseOrdersRepository } from './purchase-orders.repository';

describe('PurchaseApprovalsService', () => {
  let service: PurchaseApprovalsService;
  let repoMock: jest.Mocked<Partial<PurchaseOrdersRepository>>;
  let auditMock: jest.Mocked<Partial<AuditService>>;
  let runInTransactionMock: jest.Mock;
  let poolQueryMock: jest.Mock;

  const mockApprover: AuthenticatedPrincipal = {
    id: 'approver-1',
    roles: ['SERVICE_MANAGER'],
    permissions: ['purchasing.approve', 'purchasing.read'],
    email: 'manager@test.com',
    authTime: new Date(),
    organizationScopeIds: ['scope-1'],
    displayName: 'Service Manager',
    preferredLocale: 'en',
    mustChangePassword: false,
  };

  beforeEach(async () => {
    repoMock = {
      findById: jest.fn(),
      lockPo: jest.fn(),
    };
    auditMock = { record: jest.fn() };
    poolQueryMock = jest.fn();
    runInTransactionMock = jest.fn(async (cb: (client: any) => Promise<any>) => cb({
      query: jest.fn(),
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseApprovalsService,
        { provide: PurchaseOrdersRepository, useValue: repoMock },
        {
          provide: DatabaseService,
          useValue: {
            runInTransaction: runInTransactionMock,
            getPool: () => ({ query: poolQueryMock }),
          },
        },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<PurchaseApprovalsService>(PurchaseApprovalsService);
  });

  it('lists approvals for a scoped purchase order', async () => {
    repoMock.findById = jest.fn().mockResolvedValue({
      po: { id: 'po-1' } as any,
      lines: [],
    });
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // count
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'app-1',
            purchase_order_id: 'po-1',
            approver_id: 'user-2',
            decision: 'APPROVED',
            reason: null,
            decided_at: new Date('2026-09-02T10:00:00Z'),
          },
        ],
      });

    const result = await service.list('po-1', { page: 1, pageSize: 20 }, mockApprover);
    expect(result.items.length).toBe(1);
    expect(result.items[0].decision).toBe('APPROVED');
    expect(result.page.totalItems).toBe(1);
  });

  it('rejects creator self-decision with 409 SEPARATION_OF_DUTIES_VIOLATION', async () => {
    const fakePo = {
      id: 'po-1',
      po_number: 'PO-2026-000001',
      status: 'PENDING_APPROVAL',
      created_by: mockApprover.id, // creator is approver!
    };
    repoMock.lockPo = jest.fn().mockResolvedValue(fakePo as any);

    await expect(
      service.decide('po-1', { decision: 'APPROVED' }, mockApprover),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCode.SEPARATION_OF_DUTIES_VIOLATION,
    });
  });

  it('rejects duplicate decision by same approver with 409 DUPLICATE_APPROVAL', async () => {
    const fakePo = {
      id: 'po-1',
      po_number: 'PO-2026-000001',
      status: 'PENDING_APPROVAL',
      created_by: 'creator-other',
    };
    repoMock.lockPo = jest.fn().mockResolvedValue(fakePo as any);

    const fakeClient = {
      query: jest.fn().mockResolvedValueOnce({ rows: [{ exists: true }] }), // already decided
    };
    runInTransactionMock.mockImplementation(async (cb) => cb(fakeClient));

    await expect(
      service.decide('po-1', { decision: 'APPROVED' }, mockApprover),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCode.DUPLICATE_APPROVAL,
    });
  });

  it('rejection marks PO as REJECTED immediately', async () => {
    const fakePo = {
      id: 'po-1',
      po_number: 'PO-2026-000001',
      status: 'PENDING_APPROVAL',
      created_by: 'creator-other',
    };
    repoMock.lockPo = jest.fn().mockResolvedValue(fakePo as any);

    const fakeClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ exists: false }] }) // not duplicate
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'app-1',
              purchase_order_id: 'po-1',
              approver_id: mockApprover.id,
              decision: 'REJECTED',
              reason: 'Over budget',
              decided_at: new Date(),
            },
          ],
        }) // insert approval
        .mockResolvedValueOnce({ rows: [] }), // update PO
    };
    runInTransactionMock.mockImplementation(async (cb) => cb(fakeClient));

    const result = await service.decide(
      'po-1',
      { decision: 'REJECTED', reason: 'Over budget' },
      mockApprover,
    );

    expect(result.decision).toBe('REJECTED');
    expect(fakeClient.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'REJECTED'"),
      expect.anything(),
    );
  });

  it('approves PO when single approval is required', async () => {
    const fakePo = {
      id: 'po-1',
      po_number: 'PO-2026-000001',
      status: 'PENDING_APPROVAL',
      required_approvals: 1,
      approvals_recorded: 0,
      created_by: 'creator-other',
    };
    repoMock.lockPo = jest.fn().mockResolvedValue(fakePo as any);

    const fakeClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ exists: false }] }) // not duplicate
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'app-1',
              purchase_order_id: 'po-1',
              approver_id: mockApprover.id,
              decision: 'APPROVED',
              reason: null,
              decided_at: new Date(),
            },
          ],
        }) // insert approval
        .mockResolvedValueOnce({ rows: [] }), // update PO to APPROVED
    };
    runInTransactionMock.mockImplementation(async (cb) => cb(fakeClient));

    const result = await service.decide('po-1', { decision: 'APPROVED' }, mockApprover);
    expect(result.decision).toBe('APPROVED');
    expect(fakeClient.query).toHaveBeenCalledWith(
      expect.stringContaining("status = $1"),
      ['APPROVED', 1, mockApprover.id, 'po-1'],
    );
  });

  it('keeps PO in PENDING_APPROVAL when 2 approvals are required and 1 recorded', async () => {
    const fakePo = {
      id: 'po-1',
      po_number: 'PO-2026-000001',
      status: 'PENDING_APPROVAL',
      required_approvals: 2,
      approvals_recorded: 0,
      created_by: 'creator-other',
    };
    repoMock.lockPo = jest.fn().mockResolvedValue(fakePo as any);

    const fakeClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ exists: false }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'app-1',
              purchase_order_id: 'po-1',
              approver_id: mockApprover.id,
              decision: 'APPROVED',
              reason: null,
              decided_at: new Date(),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
    };
    runInTransactionMock.mockImplementation(async (cb) => cb(fakeClient));

    await service.decide('po-1', { decision: 'APPROVED' }, mockApprover);
    expect(fakeClient.query).toHaveBeenCalledWith(
      expect.stringContaining("status = $1"),
      ['PENDING_APPROVAL', 1, mockApprover.id, 'po-1'],
    );
  });
});

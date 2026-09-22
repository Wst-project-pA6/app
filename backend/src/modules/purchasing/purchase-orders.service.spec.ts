import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { PurchaseOrdersRepository } from './purchase-orders.repository';
import { PurchaseOrdersService } from './purchase-orders.service';

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;
  let repoMock: jest.Mocked<Partial<PurchaseOrdersRepository>>;
  let auditMock: jest.Mocked<Partial<AuditService>>;
  let runInTransactionMock: jest.Mock;

  const mockActor: AuthenticatedPrincipal = {
    id: 'user-1',
    roles: ['PARTS_SPECIALIST'],
    permissions: ['purchasing.create', 'purchasing.read'],
    email: 'specialist@test.com',
    authTime: new Date(),
    organizationScopeIds: ['scope-1'],
    displayName: 'Specialist',
    preferredLocale: 'en',
    mustChangePassword: false,
  };

  beforeEach(async () => {
    repoMock = {
      verifyStoreInScope: jest.fn(),
      verifyVendorActive: jest.fn(),
      verifyPartsActive: jest.fn(),
      getSystemCurrency: jest.fn(),
      generatePoNumber: jest.fn(),
      findById: jest.fn(),
      lockPo: jest.fn(),
      list: jest.fn(),
      getLinesForPo: jest.fn(),
    };
    auditMock = { record: jest.fn() };
    runInTransactionMock = jest.fn(async (cb: (client: any) => Promise<any>) => cb({
      query: jest.fn(),
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersService,
        { provide: PurchaseOrdersRepository, useValue: repoMock },
        { provide: DatabaseService, useValue: { runInTransaction: runInTransactionMock } },
        { provide: AuditService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<PurchaseOrdersService>(PurchaseOrdersService);
  });

  it('creates a DRAFT purchase order without auto-approval', async () => {
    repoMock.verifyStoreInScope = jest.fn().mockResolvedValue(true);
    repoMock.verifyVendorActive = jest.fn().mockResolvedValue(true);
    repoMock.verifyPartsActive = jest.fn().mockResolvedValue(
      new Map([['part-1', { sku: 'SKU-01', status: 'ACTIVE' }]]),
    );
    repoMock.getSystemCurrency = jest.fn().mockResolvedValue('SAR');
    repoMock.generatePoNumber = jest.fn().mockResolvedValue('PO-2026-000001');

    const fakeClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'po-1',
              po_number: 'PO-2026-000001',
              vendor_id: 'vend-1',
              store_id: 'store-1',
              status: 'DRAFT',
              total_amount: '0.0000',
              total_currency: 'SAR',
              required_approvals: null,
              approvals_recorded: 0,
              version: 1,
              created_at: new Date(),
              updated_at: new Date(),
              created_by: 'user-1',
              updated_by: 'user-1',
            },
          ],
        }) // insert PO
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'line-1',
              purchase_order_id: 'po-1',
              line_number: 1,
              part_id: 'part-1',
              quantity_ordered: 10,
              quantity_accepted: 0,
              quantity_rejected: 0,
              unit_cost_amount: '5.0000',
              unit_cost_currency: 'SAR',
              line_total_amount: '50.0000',
              line_total_currency: 'SAR',
            },
          ],
        }) // insert line
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'po-1',
              po_number: 'PO-2026-000001',
              vendor_id: 'vend-1',
              store_id: 'store-1',
              status: 'DRAFT',
              total_amount: '50.0000',
              total_currency: 'SAR',
              required_approvals: null,
              approvals_recorded: 0,
              version: 1,
              created_at: new Date(),
              updated_at: new Date(),
              created_by: 'user-1',
              updated_by: 'user-1',
            },
          ],
        }), // update total
    };
    runInTransactionMock.mockImplementation(async (cb) => cb(fakeClient));

    const result = await service.create(
      {
        vendorId: 'vend-1',
        storeId: 'store-1',
        lines: [
          {
            partId: 'part-1',
            quantityOrdered: 10,
            unitCost: { amount: '5.0000', currency: 'SAR' },
          },
        ],
      },
      mockActor,
    );

    expect(result.status).toBe('DRAFT');
    expect(result.requiredApprovals).toBeNull();
    expect(result.approvalsRecorded).toBe(0);
    expect(result.lines.length).toBe(1);
    expect(result.lines[0].lineNumber).toBe(1);
    expect(result.total.amount).toBe('50.0000');
  });

  it('rejects creation for out-of-scope store with 404 NOT_FOUND', async () => {
    repoMock.verifyStoreInScope = jest.fn().mockResolvedValue(false);

    await expect(
      service.create(
        {
          vendorId: 'vend-1',
          storeId: 'store-out-of-scope',
          lines: [{ partId: 'part-1', quantityOrdered: 1, unitCost: { amount: '1', currency: 'SAR' } }],
        },
        mockActor,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('snapshots tier requiredApprovals upon submission and remains PENDING_APPROVAL', async () => {
    const fakePo = {
      id: 'po-1',
      po_number: 'PO-2026-000001',
      status: 'DRAFT',
      total_amount: '6000.0000',
      total_currency: 'SAR',
      version: 1,
      created_by: 'user-1',
    };
    repoMock.lockPo = jest.fn().mockResolvedValue(fakePo as any);
    repoMock.getLinesForPo = jest.fn().mockResolvedValue([]);

    const fakeClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ required_approvals: 2 }] }) // tier query
        .mockResolvedValueOnce({
          rows: [
            {
              ...fakePo,
              status: 'PENDING_APPROVAL',
              required_approvals: 2,
              submitted_at: new Date(),
              version: 2,
              created_at: new Date(),
              updated_at: new Date(),
              updated_by: 'user-1',
            },
          ],
        }), // update PO
    };
    runInTransactionMock.mockImplementation(async (cb) => cb(fakeClient));

    const result = await service.transition(
      'po-1',
      { toStatus: 'PENDING_APPROVAL' },
      mockActor,
    );

    expect(result.status).toBe('PENDING_APPROVAL');
    expect(result.requiredApprovals).toBe(2);
    expect(result.version).toBe(2);
  });

  it('cancels APPROVED order only when no goods receipt exists', async () => {
    const fakePo = {
      id: 'po-1',
      po_number: 'PO-2026-000001',
      status: 'APPROVED',
      total_amount: '100.0000',
      total_currency: 'SAR',
      version: 2,
      created_by: 'user-1',
    };
    repoMock.lockPo = jest.fn().mockResolvedValue(fakePo as any);
    repoMock.getLinesForPo = jest.fn().mockResolvedValue([]);

    const fakeClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ exists: false }] }) // no receipts
        .mockResolvedValueOnce({
          rows: [
            {
              ...fakePo,
              status: 'CANCELLED',
              cancellation_reason: 'Budget cut',
              version: 3,
              created_at: new Date(),
              updated_at: new Date(),
              updated_by: 'user-1',
            },
          ],
        }),
    };
    runInTransactionMock.mockImplementation(async (cb) => cb(fakeClient));

    const result = await service.transition(
      'po-1',
      { toStatus: 'CANCELLED', reason: 'Budget cut' },
      mockActor,
    );
    expect(result.status).toBe('CANCELLED');
  });

  it('rejects cancellation on APPROVED order when goods receipts exist', async () => {
    const fakePo = {
      id: 'po-1',
      po_number: 'PO-2026-000001',
      status: 'APPROVED',
      version: 2,
    };
    repoMock.lockPo = jest.fn().mockResolvedValue(fakePo as any);

    const fakeClient = {
      query: jest.fn().mockResolvedValueOnce({ rows: [{ exists: true }] }), // receipt exists
    };
    runInTransactionMock.mockImplementation(async (cb) => cb(fakeClient));

    await expect(
      service.transition('po-1', { toStatus: 'CANCELLED', reason: 'Some reason' }, mockActor),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCode.INVALID_STATE_TRANSITION,
    });
  });
});

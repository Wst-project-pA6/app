import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { GoodsReceiptsService } from './goods-receipts.service';
import { PurchaseOrdersRepository } from './purchase-orders.repository';

describe('GoodsReceiptsService', () => {
  let service: GoodsReceiptsService;
  let repoMock: jest.Mocked<Partial<PurchaseOrdersRepository>>;
  let auditMock: jest.Mocked<Partial<AuditService>>;
  let runInTransactionMock: jest.Mock;
  let poolQueryMock: jest.Mock;

  const mockReceiver: AuthenticatedPrincipal = {
    id: 'user-receiver',
    roles: ['STOREKEEPER'],
    permissions: ['purchasing.receive', 'purchasing.read'],
    email: 'storekeeper@test.com',
    authTime: new Date(),
    organizationScopeIds: ['scope-1'],
    displayName: 'Storekeeper',
    preferredLocale: 'en',
    mustChangePassword: false,
  };

  beforeEach(async () => {
    repoMock = {
      findById: jest.fn(),
      lockPo: jest.fn(),
      verifyStoreInScope: jest.fn(),
      generateReceiptNumber: jest.fn(),
    };
    auditMock = { record: jest.fn() };
    poolQueryMock = jest.fn();
    runInTransactionMock = jest.fn(async (cb: (client: any) => Promise<any>) => cb({
      query: jest.fn(),
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoodsReceiptsService,
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

    service = module.get<GoodsReceiptsService>(GoodsReceiptsService);
  });

  it('lists goods receipts for a scoped purchase order', async () => {
    repoMock.findById = jest.fn().mockResolvedValue({
      po: { id: 'po-1' } as any,
      lines: [],
    });
    poolQueryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // count
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'gr-1',
            receipt_number: 'GR-2026-000001',
            purchase_order_id: 'po-1',
            store_id: 'store-1',
            delivery_reference: 'DEL-1',
            received_at: new Date('2026-09-02T10:00:00Z'),
            received_by: mockReceiver.id,
            idempotency_key: null,
          },
        ],
      }) // receipts
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'grl-1',
            goods_receipt_id: 'gr-1',
            purchase_order_line_id: 'line-1',
            part_id: 'part-1',
            quantity_received: 5,
            quantity_accepted: 5,
            quantity_rejected: 0,
            rejection_reason: null,
            stock_movement_id: 'sm-1',
          },
        ],
      }); // lines

    const result = await service.list('po-1', { page: 1, pageSize: 20 }, mockReceiver);
    expect(result.items.length).toBe(1);
    expect(result.items[0].receiptNumber).toBe('GR-2026-000001');
    expect(result.items[0].lines.length).toBe(1);
    expect(result.page.totalItems).toBe(1);
  });

  it('rejects payload when quantityReceived != quantityAccepted + quantityRejected', async () => {
    await expect(
      service.create(
        'po-1',
        {
          lines: [
            {
              purchaseOrderLineId: 'line-1',
              quantityReceived: 10,
              quantityAccepted: 8,
              quantityRejected: 1, // 8 + 1 != 10
            },
          ],
        },
        undefined,
        mockReceiver,
      ),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: ErrorCode.VALIDATION_FAILED,
    });
  });

  it('rejects payload when rejectionReason is missing for rejected quantity', async () => {
    await expect(
      service.create(
        'po-1',
        {
          lines: [
            {
              purchaseOrderLineId: 'line-1',
              quantityReceived: 10,
              quantityAccepted: 8,
              quantityRejected: 2,
              rejectionReason: '',
            },
          ],
        },
        undefined,
        mockReceiver,
      ),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: ErrorCode.VALIDATION_FAILED,
    });
  });

  it('rejects receipt when cumulative accepted exceeds ordered quantity with 409', async () => {
    const fakePo = {
      id: 'po-1',
      po_number: 'PO-2026-000001',
      store_id: 'store-1',
      status: 'APPROVED',
      total_currency: 'SAR',
    };
    repoMock.lockPo = jest.fn().mockResolvedValue(fakePo as any);

    const fakeClient = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            id: 'line-1',
            purchase_order_id: 'po-1',
            line_number: 1,
            part_id: 'part-1',
            sku: 'SKU-01',
            quantity_ordered: 10,
            quantity_accepted: 8,
            quantity_rejected: 0,
            unit_cost_amount: '10.0000',
            unit_cost_currency: 'SAR',
          },
        ],
      }),
    };
    runInTransactionMock.mockImplementation(async (cb) => cb(fakeClient));

    await expect(
      service.create(
        'po-1',
        {
          lines: [
            {
              purchaseOrderLineId: 'line-1',
              quantityReceived: 5,
              quantityAccepted: 5, // 8 + 5 = 13 > 10
              quantityRejected: 0,
            },
          ],
        },
        undefined,
        mockReceiver,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCode.RECEIPT_EXCEEDS_ORDERED,
    });
  });

  it('creates partial goods receipt and advances PO to PARTIALLY_RECEIVED', async () => {
    const fakePo = {
      id: 'po-1',
      po_number: 'PO-2026-000001',
      store_id: 'store-1',
      status: 'APPROVED',
      total_currency: 'SAR',
    };
    repoMock.lockPo = jest.fn().mockResolvedValue(fakePo as any);
    repoMock.generateReceiptNumber = jest.fn().mockResolvedValue('GR-2026-000001');

    const fakeClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'line-1',
              purchase_order_id: 'po-1',
              line_number: 1,
              part_id: 'part-1',
              sku: 'SKU-01',
              quantity_ordered: 10,
              quantity_accepted: 0,
              quantity_rejected: 0,
              unit_cost_amount: '15.0000',
              unit_cost_currency: 'SAR',
            },
          ],
        }) // lock PO lines
        .mockResolvedValueOnce({ rows: [] }) // lock parts
        .mockResolvedValueOnce({ rows: [] }) // insert default balance
        .mockResolvedValueOnce({ rows: [] }) // lock balance
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'gr-1',
              receipt_number: 'GR-2026-000001',
              purchase_order_id: 'po-1',
              store_id: 'store-1',
              delivery_reference: 'DEL-1',
              received_at: new Date(),
              received_by: mockReceiver.id,
              idempotency_key: null,
            },
          ],
        }) // insert goods_receipt
        .mockResolvedValueOnce({ rows: [] }) // update po line
        .mockResolvedValueOnce({
          rows: [{ on_hand: 5, reserved: 0 }],
        }) // update stock_balance with weighted cost
        .mockResolvedValueOnce({ rows: [{ id: 'sm-1' }] }) // insert stock_movement
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'grl-1',
              goods_receipt_id: 'gr-1',
              purchase_order_line_id: 'line-1',
              part_id: 'part-1',
              quantity_received: 5,
              quantity_accepted: 5,
              quantity_rejected: 0,
              rejection_reason: null,
              stock_movement_id: 'sm-1',
            },
          ],
        }) // insert goods_receipt_lines
        .mockResolvedValueOnce({
          rows: [{ quantity_ordered: 10, quantity_accepted: 5 }], // partially received
        }) // check all PO lines
        .mockResolvedValueOnce({ rows: [] }), // advance PO status to PARTIALLY_RECEIVED
    };
    runInTransactionMock.mockImplementation(async (cb) => cb(fakeClient));

    const result = await service.create(
      'po-1',
      {
        deliveryReference: 'DEL-1',
        lines: [
          {
            purchaseOrderLineId: 'line-1',
            quantityReceived: 5,
            quantityAccepted: 5,
            quantityRejected: 0,
          },
        ],
      },
      undefined,
      mockReceiver,
    );

    expect(result.receiptNumber).toBe('GR-2026-000001');
    expect(fakeClient.query).toHaveBeenCalledWith(
      expect.stringContaining("status = $1"),
      ['PARTIALLY_RECEIVED', mockReceiver.id, 'po-1'],
    );
  });

  it('successfully creates full goods receipt and advances PO status to RECEIVED', async () => {
    const fakePo = {
      id: 'po-1',
      po_number: 'PO-2026-000001',
      store_id: 'store-1',
      status: 'APPROVED',
      total_currency: 'SAR',
    };
    repoMock.lockPo = jest.fn().mockResolvedValue(fakePo as any);
    repoMock.generateReceiptNumber = jest.fn().mockResolvedValue('GR-2026-000001');

    const fakeClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'line-1',
              purchase_order_id: 'po-1',
              line_number: 1,
              part_id: 'part-1',
              sku: 'SKU-01',
              quantity_ordered: 10,
              quantity_accepted: 0,
              quantity_rejected: 0,
              unit_cost_amount: '15.0000',
              unit_cost_currency: 'SAR',
            },
          ],
        }) // lock PO lines
        .mockResolvedValueOnce({ rows: [] }) // lock parts
        .mockResolvedValueOnce({ rows: [] }) // insert default balance
        .mockResolvedValueOnce({ rows: [] }) // lock balance
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'gr-1',
              receipt_number: 'GR-2026-000001',
              purchase_order_id: 'po-1',
              store_id: 'store-1',
              delivery_reference: 'DEL-1',
              received_at: new Date(),
              received_by: mockReceiver.id,
              idempotency_key: null,
            },
          ],
        }) // insert goods_receipt
        .mockResolvedValueOnce({ rows: [] }) // update po line
        .mockResolvedValueOnce({
          rows: [{ on_hand: 10, reserved: 0 }],
        }) // update stock_balance with weighted cost
        .mockResolvedValueOnce({ rows: [{ id: 'sm-1' }] }) // insert stock_movement
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'grl-1',
              goods_receipt_id: 'gr-1',
              purchase_order_line_id: 'line-1',
              part_id: 'part-1',
              quantity_received: 10,
              quantity_accepted: 10,
              quantity_rejected: 0,
              rejection_reason: null,
              stock_movement_id: 'sm-1',
            },
          ],
        }) // insert goods_receipt_lines
        .mockResolvedValueOnce({
          rows: [{ quantity_ordered: 10, quantity_accepted: 10 }],
        }) // check all PO lines
        .mockResolvedValueOnce({ rows: [] }), // advance PO status to RECEIVED
    };
    runInTransactionMock.mockImplementation(async (cb) => cb(fakeClient));

    const result = await service.create(
      'po-1',
      {
        deliveryReference: 'DEL-1',
        lines: [
          {
            purchaseOrderLineId: 'line-1',
            quantityReceived: 10,
            quantityAccepted: 10,
            quantityRejected: 0,
          },
        ],
      },
      undefined,
      mockReceiver,
    );

    expect(result.receiptNumber).toBe('GR-2026-000001');
    expect(result.lines.length).toBe(1);
    expect(result.lines[0].quantityAccepted).toBe(10);
    expect(result.lines[0].stockMovementId).toBe('sm-1');
    expect(fakeClient.query).toHaveBeenCalledWith(
      expect.stringContaining("status = $1"),
      ['RECEIVED', mockReceiver.id, 'po-1'],
    );
  });

  it('handles idempotency conflict on mismatched payload with 409', async () => {
    const fakeClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] }) // advisory lock
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'gr-1',
              receipt_number: 'GR-2026-000001',
              purchase_order_id: 'po-1',
              store_id: 'store-1',
              delivery_reference: 'DIFFERENT-REF',
              received_at: new Date(),
              received_by: mockReceiver.id,
              idempotency_key: 'idem-key-12345',
            },
          ],
        }),
    };
    runInTransactionMock.mockImplementation(async (cb) => cb(fakeClient));

    await expect(
      service.create(
        'po-1',
        {
          deliveryReference: 'ORIGINAL-REF',
          lines: [
            {
              purchaseOrderLineId: 'line-1',
              quantityReceived: 10,
              quantityAccepted: 10,
              quantityRejected: 0,
            },
          ],
        },
        'idem-key-12345',
        mockReceiver,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCode.IDEMPOTENCY_CONFLICT,
    });
  });
});

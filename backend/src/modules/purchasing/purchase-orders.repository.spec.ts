import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../common/database/database.service';
import { PurchaseOrdersRepository } from './purchase-orders.repository';

describe('PurchaseOrdersRepository', () => {
  let repository: PurchaseOrdersRepository;
  let queryMock: jest.Mock;

  beforeEach(async () => {
    queryMock = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrdersRepository,
        {
          provide: DatabaseService,
          useValue: { getPool: () => ({ query: queryMock }) },
        },
      ],
    }).compile();

    repository = module.get<PurchaseOrdersRepository>(PurchaseOrdersRepository);
  });

  it('verifies store is active and in caller scopes', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ organization_scope_id: 'scope-1', status: 'ACTIVE' }],
    });

    const ok = await repository.verifyStoreInScope('store-1', ['scope-1', 'scope-2']);
    expect(ok).toBe(true);
  });

  it('rejects store when outside caller scopes', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ organization_scope_id: 'scope-other', status: 'ACTIVE' }],
    });

    const ok = await repository.verifyStoreInScope('store-1', ['scope-1']);
    expect(ok).toBe(false);
  });

  it('verifies active parts and returns SKU map', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { id: 'p-1', sku: 'SKU-001', status: 'ACTIVE' },
        { id: 'p-2', sku: 'SKU-002', status: 'INACTIVE' },
      ],
    });

    const map = await repository.verifyPartsActive(['p-1', 'p-2']);
    expect(map.get('p-1')?.status).toBe('ACTIVE');
    expect(map.get('p-2')?.status).toBe('INACTIVE');
  });

  it('generates formatted PO number', async () => {
    const client = {
      query: jest.fn().mockResolvedValueOnce({ rows: [{ nextval: '42' }] }),
    } as any;

    const poNumber = await repository.generatePoNumber(client);
    const year = new Date().getUTCFullYear();
    expect(poNumber).toBe(`PO-${year}-000042`);
  });

  it('generates formatted GR number', async () => {
    const client = {
      query: jest.fn().mockResolvedValueOnce({ rows: [{ nextval: '7' }] }),
    } as any;

    const grNumber = await repository.generateReceiptNumber(client);
    const year = new Date().getUTCFullYear();
    expect(grNumber).toBe(`GR-${year}-000007`);
  });
});

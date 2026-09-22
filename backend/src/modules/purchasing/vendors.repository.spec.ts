import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../../common/database/database.service';
import { ErrorCode } from '../../common/errors/error-codes';
import { VendorsRepository } from './vendors.repository';

describe('VendorsRepository', () => {
  let repository: VendorsRepository;
  let queryMock: jest.Mock;

  beforeEach(async () => {
    queryMock = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorsRepository,
        {
          provide: DatabaseService,
          useValue: {
            getPool: () => ({ query: queryMock }),
          },
        },
      ],
    }).compile();

    repository = module.get<VendorsRepository>(VendorsRepository);
  });

  it('creates vendor with status ACTIVE', async () => {
    const row = {
      id: 'v-1',
      code: 'VEND-01',
      name: 'Vendor One',
      contact_name: null,
      phone: null,
      email: null,
      status: 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
      created_by: 'user-1',
      updated_by: 'user-1',
    };
    queryMock.mockResolvedValueOnce({ rows: [row] });

    const result = await repository.create(
      { code: 'VEND-01', name: 'Vendor One' },
      'user-1',
    );
    expect(result.status).toBe('ACTIVE');
    expect(result.code).toBe('VEND-01');
  });

  it('maps uq_vendor_code collision to 409 DUPLICATE_RESOURCE', async () => {
    const dbError = { code: '23505', constraint: 'uq_vendor_code' };
    queryMock.mockRejectedValueOnce(dbError);

    await expect(
      repository.create({ code: 'VEND-01', name: 'Vendor One' }, 'user-1'),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCode.DUPLICATE_RESOURCE,
    });
  });

  it('lists vendors with pagination and filters', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'v-1',
            code: 'VEND-01',
            name: 'Vendor One',
            contact_name: null,
            phone: null,
            email: null,
            status: 'ACTIVE',
            created_at: new Date(),
            updated_at: new Date(),
            created_by: null,
            updated_by: null,
          },
        ],
      });

    const result = await repository.list({
      page: 1,
      pageSize: 10,
      status: 'ACTIVE',
    });
    expect(result.total).toBe(1);
    expect(result.items.length).toBe(1);
  });

  it('checks open purchase orders referencing vendor', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ exists: true }] });

    const hasOpen = await repository.hasOpenPurchaseOrders('v-1');
    expect(hasOpen).toBe(true);
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED')"),
      ['v-1'],
    );
  });
});

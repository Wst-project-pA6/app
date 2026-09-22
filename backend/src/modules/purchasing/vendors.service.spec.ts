import { Test, TestingModule } from '@nestjs/testing';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { VendorsRepository } from './vendors.repository';
import { VendorsService } from './vendors.service';

describe('VendorsService', () => {
  let service: VendorsService;
  let repoMock: jest.Mocked<Partial<VendorsRepository>>;

  const mockActor: AuthenticatedPrincipal = {
    id: 'user-1',
    roles: ['PARTS_SPECIALIST'],
    permissions: ['vendors.read', 'vendors.write'],
    email: 'specialist@test.com',
    authTime: new Date(),
    scopeIds: [],
  };

  const sampleVendorRow = {
    id: 'v-1',
    code: 'VEND-01',
    name: 'Vendor One',
    contact_name: 'John',
    phone: '+1234567890',
    email: 'john@vendor.com',
    status: 'ACTIVE' as const,
    created_at: new Date('2026-09-01T00:00:00Z'),
    updated_at: new Date('2026-09-01T00:00:00Z'),
    created_by: 'user-1',
    updated_by: 'user-1',
  };

  beforeEach(async () => {
    repoMock = {
      create: jest.fn(),
      findById: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      hasOpenPurchaseOrders: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorsService,
        { provide: VendorsRepository, useValue: repoMock },
      ],
    }).compile();

    service = module.get<VendorsService>(VendorsService);
  });

  it('creates vendor with status ACTIVE', async () => {
    repoMock.create = jest.fn().mockResolvedValue(sampleVendorRow);

    const result = await service.create(
      { code: 'VEND-01', name: 'Vendor One' },
      mockActor,
    );
    expect(result.code).toBe('VEND-01');
    expect(result.status).toBe('ACTIVE');
  });

  it('lists vendors globally after permission check', async () => {
    repoMock.list = jest.fn().mockResolvedValue({
      items: [sampleVendorRow],
      total: 1,
    });

    const result = await service.list({ page: 1, pageSize: 20 });
    expect(result.items.length).toBe(1);
    expect(result.page.totalItems).toBe(1);
  });

  it('throws 404 NOT_FOUND when updating non-existent vendor', async () => {
    repoMock.findById = jest.fn().mockResolvedValue(null);

    await expect(
      service.update('v-unknown', { name: 'New Name' }, mockActor),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('throws 409 RESOURCE_IN_USE when deactivating vendor with open POs', async () => {
    repoMock.findById = jest.fn().mockResolvedValue(sampleVendorRow);
    repoMock.hasOpenPurchaseOrders = jest.fn().mockResolvedValue(true);

    await expect(
      service.update('v-1', { status: 'INACTIVE' }, mockActor),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCode.RESOURCE_IN_USE,
    });
  });

  it('successfully deactivates vendor when no open POs exist', async () => {
    repoMock.findById = jest.fn().mockResolvedValue(sampleVendorRow);
    repoMock.hasOpenPurchaseOrders = jest.fn().mockResolvedValue(false);
    repoMock.update = jest.fn().mockResolvedValue({
      ...sampleVendorRow,
      status: 'INACTIVE',
    });

    const result = await service.update('v-1', { status: 'INACTIVE' }, mockActor);
    expect(result.status).toBe('INACTIVE');
  });
});

import { HttpStatus } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { DatabaseService } from '../../common/database/database.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CompatibilityRow, PartRow, PartsRepository } from './parts.repository';
import { PartsService } from './parts.service';
import { PartStatus } from './dto/part.dto';

const partId = '11111111-1111-4111-8111-111111111111';
const actor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'parts@example.test',
  displayName: 'Parts Manager',
  preferredLocale: 'en',
  roles: ['STOREKEEPER_PROCUREMENT'],
  permissions: ['parts.read', 'parts.write'],
  organizationScopeIds: ['22222222-2222-4222-8222-222222222222'],
  mustChangePassword: false,
};

const mockPartRow: PartRow = {
  id: partId,
  sku: 'FLTR-OIL-001',
  barcode: '12345678',
  name_en: 'Oil Filter',
  name_ar: 'فلتر زيت',
  category: 'Filters',
  unit_of_measure: 'EA',
  selling_price_amount: '25.5000',
  selling_price_currency: 'USD',
  status: PartStatus.ACTIVE,
  version: 1,
  created_at: new Date(),
  updated_at: new Date(),
  created_by: actor.id,
  updated_by: actor.id,
};

const mockCompatRow: CompatibilityRow = {
  id: '33333333-3333-4333-8333-333333333333',
  part_id: partId,
  make: 'Toyota',
  model: 'Corolla',
  year_from: 2018,
  year_to: 2022,
};

const mockTransactionService = (client: unknown = {}) =>
  ({
    runInTransaction: jest.fn(async (work: (val: never) => unknown) => work(client as never)),
  }) as unknown as TransactionService;

describe('PartsService', () => {
  it('lists parts and maps pagination and grouped vehicle compatibilities', async () => {
    const listMock = jest.fn().mockResolvedValue({ rows: [mockPartRow], totalItems: 1 });
    const findCompatMock = jest.fn().mockResolvedValue({ [partId]: [mockCompatRow] });
    const repository = {
      list: listMock,
      findCompatibilitiesByPartIds: findCompatMock,
    } as unknown as PartsRepository;
    const service = new PartsService(
      repository,
      {} as TransactionService,
      {} as AuditService,
      {} as DatabaseService,
    );

    const result = await service.list({ page: 1, pageSize: 20 });

    expect(result).toMatchObject({
      items: [
        {
          id: partId,
          sku: 'FLTR-OIL-001',
          barcode: '12345678',
          name: { en: 'Oil Filter', ar: 'فلتر زيت' },
          category: 'Filters',
          unitOfMeasure: 'EA',
          sellingPrice: { amount: '25.5000', currency: 'USD' },
          compatibility: [{ make: 'Toyota', model: 'Corolla', yearFrom: 2018, yearTo: 2022 }],
          status: PartStatus.ACTIVE,
          version: 1,
        },
      ],
      page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    expect(listMock.mock.calls).toEqual([[{ page: 1, pageSize: 20 }]]);
    expect(findCompatMock.mock.calls).toHaveLength(1);
  });

  it('rejects an unallowlisted part sort field with 400 BAD_REQUEST', async () => {
    const listMock = jest.fn();
    const repository = { list: listMock } as unknown as PartsRepository;
    const service = new PartsService(
      repository,
      {} as TransactionService,
      {} as AuditService,
      {} as DatabaseService,
    );

    await expect(service.list({ page: 1, pageSize: 20, sort: 'status' })).rejects.toMatchObject({
      statusCode: HttpStatus.BAD_REQUEST,
      code: ErrorCode.BAD_REQUEST,
    });
    expect(listMock.mock.calls).toHaveLength(0);
  });

  it('gets a single part with compatibilities and throws 404 when not found', async () => {
    const findByIdMock = jest.fn().mockResolvedValue(mockPartRow);
    const findCompatMock = jest.fn().mockResolvedValue([mockCompatRow]);
    const repository = {
      findById: findByIdMock,
      findCompatibilitiesByPartId: findCompatMock,
    } as unknown as PartsRepository;
    const service = new PartsService(
      repository,
      {} as TransactionService,
      {} as AuditService,
      {} as DatabaseService,
    );

    const result = await service.get(partId);
    expect(result).toMatchObject({ id: partId, sku: 'FLTR-OIL-001' });

    findByIdMock.mockResolvedValue(null);
    await expect(service.get('non-existent')).rejects.toMatchObject({
      statusCode: HttpStatus.NOT_FOUND,
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('creates part, inserts compatibilities, and records audit transactionally', async () => {
    const createMock = jest.fn().mockResolvedValue(mockPartRow);
    const insertCompatMock = jest.fn().mockResolvedValue([mockCompatRow]);
    const auditRecordMock = jest.fn().mockResolvedValue(undefined);
    const repository = {
      create: createMock,
      insertCompatibilities: insertCompatMock,
    } as unknown as PartsRepository;
    const audit = { record: auditRecordMock } as unknown as AuditService;
    const tx = mockTransactionService();
    const service = new PartsService(repository, tx, audit);

    const result = await service.create(
      {
        sku: 'FLTR-OIL-001',
        barcode: '12345678',
        name: { en: 'Oil Filter', ar: 'فلتر زيت' },
        category: 'Filters',
        unitOfMeasure: 'EA',
        sellingPrice: { amount: '25.5000', currency: 'USD' },
        compatibility: [{ make: 'Toyota', model: 'Corolla', yearFrom: 2018, yearTo: 2022 }],
      },
      actor,
    );

    expect(result).toMatchObject({ id: partId, sku: 'FLTR-OIL-001' });
    expect(createMock.mock.calls).toHaveLength(1);
    expect(insertCompatMock.mock.calls).toHaveLength(1);
    expect(auditRecordMock.mock.calls).toHaveLength(1);
    expect(auditRecordMock.mock.calls[0][1]).toMatchObject({
      action: 'PART.CREATE',
      entityType: 'PART',
      entityId: partId,
      outcome: 'SUCCESS',
    });
  });

  it('maps uq_parts_sku and uq_parts_barcode constraint violations to 409 DUPLICATE_RESOURCE on create', async () => {
    const repository = {
      create: jest.fn().mockRejectedValueOnce({ code: '23505', constraint: 'uq_parts_sku' })
        .mockRejectedValueOnce({ code: '23505', constraint: 'uq_parts_barcode' }),
    } as unknown as PartsRepository;
    const tx = mockTransactionService();
    const service = new PartsService(repository, tx, {} as AuditService);

    const dto = {
      sku: 'FLTR-001',
      name: { en: 'Filter' },
      category: 'Filters',
      unitOfMeasure: 'EA',
      sellingPrice: { amount: '10.0000', currency: 'USD' },
    };

    await expect(service.create(dto, actor)).rejects.toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCode.DUPLICATE_RESOURCE,
    });

    await expect(service.create(dto, actor)).rejects.toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCode.DUPLICATE_RESOURCE,
    });
  });

  it('preserves unexpected database errors unchanged on create', async () => {
    const error = new Error('Database down');
    const repository = {
      create: jest.fn().mockRejectedValue(error),
    } as unknown as PartsRepository;
    const tx = mockTransactionService();
    const service = new PartsService(repository, tx, {} as AuditService);

    await expect(
      service.create(
        {
          sku: 'FLTR-001',
          name: { en: 'Filter' },
          category: 'Filters',
          unitOfMeasure: 'EA',
          sellingPrice: { amount: '10.0000', currency: 'USD' },
        },
        actor,
      ),
    ).rejects.toBe(error);
  });

  it('rejects empty update bodies with 400 BAD_REQUEST', async () => {
    const repository = {} as PartsRepository;
    const service = new PartsService(repository, {} as TransactionService, {} as AuditService);

    await expect(service.update(partId, { version: 1 }, actor)).rejects.toMatchObject({
      statusCode: HttpStatus.BAD_REQUEST,
      code: ErrorCode.BAD_REQUEST,
    });
  });

  it('throws 404 NOT_FOUND when updating non-existent part', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as PartsRepository;
    const tx = mockTransactionService();
    const service = new PartsService(repository, tx, {} as AuditService);

    await expect(
      service.update(partId, { version: 1, category: 'Updated' }, actor),
    ).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND, code: ErrorCode.NOT_FOUND });
  });

  it('enforces atomic optimistic concurrency: stale version returns 409 VERSION_CONFLICT', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue({ ...mockPartRow, version: 2 }),
    } as unknown as PartsRepository;
    const tx = mockTransactionService();
    const service = new PartsService(repository, tx, {} as AuditService);

    // Caller supplied version 1, but current version in DB is 2
    await expect(
      service.update(partId, { version: 1, category: 'Updated' }, actor),
    ).rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT, code: ErrorCode.VERSION_CONFLICT });
  });

  it('enforces atomic optimistic concurrency: update affecting 0 rows returns 409 VERSION_CONFLICT', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue({ ...mockPartRow, version: 1 }),
      update: jest.fn().mockResolvedValue(null), // 0 rows updated
    } as unknown as PartsRepository;
    const tx = mockTransactionService();
    const service = new PartsService(repository, tx, {} as AuditService);

    await expect(
      service.update(partId, { version: 1, category: 'Updated' }, actor),
    ).rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT, code: ErrorCode.VERSION_CONFLICT });
  });

  it('rejects archiving part when stock remains on hand with 409 RESOURCE_IN_USE', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(mockPartRow),
      hasOnHandStock: jest.fn().mockResolvedValue(true),
      hasOpenPurchaseOrder: jest.fn().mockResolvedValue(false),
    } as unknown as PartsRepository;
    const tx = mockTransactionService();
    const service = new PartsService(repository, tx, {} as AuditService);

    await expect(
      service.update(partId, { version: 1, status: PartStatus.ARCHIVED }, actor),
    ).rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT, code: ErrorCode.RESOURCE_IN_USE });
  });

  it('rejects archiving part when open purchase order exists with 409 RESOURCE_IN_USE', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(mockPartRow),
      hasOnHandStock: jest.fn().mockResolvedValue(false),
      hasOpenPurchaseOrder: jest.fn().mockResolvedValue(true),
    } as unknown as PartsRepository;
    const tx = mockTransactionService();
    const service = new PartsService(repository, tx, {} as AuditService);

    await expect(
      service.update(partId, { version: 1, status: PartStatus.ARCHIVED }, actor),
    ).rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT, code: ErrorCode.RESOURCE_IN_USE });
  });

  it('updates part, replaces compatibilities, allows archive when clean, and records audit', async () => {
    const updatedRow: PartRow = {
      ...mockPartRow,
      status: PartStatus.ARCHIVED,
      version: 2,
    };
    const findByIdMock = jest.fn().mockResolvedValue(mockPartRow);
    const hasOnHandStockMock = jest.fn().mockResolvedValue(false);
    const hasOpenPurchaseOrderMock = jest.fn().mockResolvedValue(false);
    const updateMock = jest.fn().mockResolvedValue(updatedRow);
    const replaceCompatMock = jest.fn().mockResolvedValue([mockCompatRow]);
    const auditRecordMock = jest.fn().mockResolvedValue(undefined);
    const repository = {
      findById: findByIdMock,
      hasOnHandStock: hasOnHandStockMock,
      hasOpenPurchaseOrder: hasOpenPurchaseOrderMock,
      update: updateMock,
      replaceCompatibilities: replaceCompatMock,
    } as unknown as PartsRepository;
    const audit = { record: auditRecordMock } as unknown as AuditService;
    const tx = mockTransactionService();
    const service = new PartsService(repository, tx, audit);

    const result = await service.update(
      partId,
      {
        version: 1,
        status: PartStatus.ARCHIVED,
        compatibility: [{ make: 'Toyota', model: 'Corolla', yearFrom: 2018, yearTo: 2022 }],
      },
      actor,
    );

    expect(result.status).toBe(PartStatus.ARCHIVED);
    expect(result.version).toBe(2);
    expect(findByIdMock.mock.calls[0][2]).toBe(true); // lock = true
    expect(replaceCompatMock.mock.calls).toHaveLength(1);
    expect(auditRecordMock.mock.calls).toHaveLength(1);
    expect(auditRecordMock.mock.calls[0][1]).toMatchObject({
      action: 'PART.UPDATE',
      entityType: 'PART',
      entityId: partId,
      outcome: 'SUCCESS',
    });
  });

  it('preserves unexpected database errors unchanged on update', async () => {
    const error = new Error('Disk full');
    const repository = {
      findById: jest.fn().mockResolvedValue(mockPartRow),
      update: jest.fn().mockRejectedValue(error),
    } as unknown as PartsRepository;
    const tx = mockTransactionService();
    const service = new PartsService(repository, tx, {} as AuditService);

    await expect(
      service.update(partId, { version: 1, category: 'Filters' }, actor),
    ).rejects.toBe(error);
  });
});

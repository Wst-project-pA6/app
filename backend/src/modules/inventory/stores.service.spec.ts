import { HttpStatus } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { StoreRow, StoresRepository } from './stores.repository';
import { StoresService } from './stores.service';
import { StoreStatus } from './dto/store.dto';

const scopeId = '22222222-2222-4222-8222-222222222222';
const storeId = '11111111-1111-4111-8111-111111111111';
const actor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'storekeeper@example.test',
  displayName: 'Storekeeper',
  preferredLocale: 'en',
  roles: ['STOREKEEPER_PROCUREMENT'],
  permissions: ['inventory.read', 'stores.manage'],
  organizationScopeIds: [scopeId],
  mustChangePassword: false,
};

const storeRow: StoreRow = {
  id: storeId,
  organization_scope_id: scopeId,
  code: 'MAIN',
  name: 'Main Store',
  status: StoreStatus.ACTIVE,
  created_at: new Date(),
  updated_at: new Date(),
  created_by: actor.id,
  updated_by: actor.id,
};

const mockTransactionService = (client: unknown = {}) =>
  ({
    runInTransaction: jest.fn(async (work: (val: never) => unknown) => work(client as never)),
  }) as unknown as TransactionService;

describe('StoresService', () => {
  it('lists stores within caller scope and maps pagination', async () => {
    const listMock = jest.fn().mockResolvedValue({ rows: [storeRow], totalItems: 1 });
    const repository = { list: listMock } as unknown as StoresRepository;
    const service = new StoresService(
      repository,
      {} as TransactionService,
      new ScopeService(),
      {} as AuditService,
    );

    const result = await service.list({ page: 1, pageSize: 20 }, actor);
    expect(result).toMatchObject({
      items: [
        {
          id: storeId,
          organizationScopeId: scopeId,
          code: 'MAIN',
          name: 'Main Store',
          status: StoreStatus.ACTIVE,
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      page: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      },
    });
    expect(listMock.mock.calls).toEqual([[{ page: 1, pageSize: 20 }, [scopeId]]]);
  });

  it('rejects an unallowlisted store sort field with 400 BAD_REQUEST', async () => {
    const listMock = jest.fn();
    const repository = { list: listMock } as unknown as StoresRepository;
    const service = new StoresService(
      repository,
      {} as TransactionService,
      new ScopeService(),
      {} as AuditService,
    );

    await expect(service.list({ page: 1, pageSize: 20, sort: 'status' }, actor)).rejects.toMatchObject({
      statusCode: HttpStatus.BAD_REQUEST,
      code: ErrorCode.BAD_REQUEST,
    });
    expect(listMock.mock.calls).toHaveLength(0);
  });

  it('creates store within active caller scope and records audit transactionally', async () => {
    const findActiveScopeMock = jest.fn().mockResolvedValue(true);
    const createMock = jest.fn().mockResolvedValue(storeRow);
    const auditRecordMock = jest.fn().mockResolvedValue(undefined);
    const repository = {
      findActiveScope: findActiveScopeMock,
      create: createMock,
    } as unknown as StoresRepository;
    const audit = { record: auditRecordMock } as unknown as AuditService;
    const tx = mockTransactionService();
    const service = new StoresService(repository, tx, new ScopeService(), audit);

    const result = await service.create(
      { organizationScopeId: scopeId, code: 'MAIN', name: 'Main Store' },
      actor,
    );

    expect(result).toMatchObject({
      id: storeId,
      organizationScopeId: scopeId,
      code: 'MAIN',
      name: 'Main Store',
      status: StoreStatus.ACTIVE,
    });
    expect(findActiveScopeMock.mock.calls).toHaveLength(1);
    expect(createMock.mock.calls).toHaveLength(1);
    expect(auditRecordMock.mock.calls).toHaveLength(1);
    expect(auditRecordMock.mock.calls[0][1]).toMatchObject({
      action: 'STORE.CREATE',
      entityType: 'STORE',
      entityId: storeId,
      outcome: 'SUCCESS',
    });
  });

  it('conceals inactive or unassigned scopes on store creation', async () => {
    const otherScopeId = '33333333-3333-4333-8333-333333333333';
    const repository = {
      findActiveScope: jest.fn().mockResolvedValue(false),
      create: jest.fn(),
    } as unknown as StoresRepository;
    const tx = mockTransactionService();
    const service = new StoresService(repository, tx, new ScopeService(), {} as AuditService);

    // Unassigned scope throws NOT_FOUND
    await expect(
      service.create({ organizationScopeId: otherScopeId, code: 'MAIN', name: 'Main Store' }, actor),
    ).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND, code: ErrorCode.NOT_FOUND });

    // Assigned scope but inactive in database throws NOT_FOUND
    await expect(
      service.create({ organizationScopeId: scopeId, code: 'MAIN', name: 'Main Store' }, actor),
    ).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND, code: ErrorCode.NOT_FOUND });
  });

  it('maps uq_store_code constraint violation to 409 DUPLICATE_RESOURCE on create', async () => {
    const repository = {
      findActiveScope: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockRejectedValue({ code: '23505', constraint: 'uq_store_code' }),
    } as unknown as StoresRepository;
    const tx = mockTransactionService();
    const service = new StoresService(repository, tx, new ScopeService(), {} as AuditService);

    await expect(
      service.create({ organizationScopeId: scopeId, code: 'MAIN', name: 'Main Store' }, actor),
    ).rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT, code: ErrorCode.DUPLICATE_RESOURCE });
  });

  it('preserves unexpected database errors unchanged on create', async () => {
    const dbError = new Error('Database connection lost');
    const repository = {
      findActiveScope: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockRejectedValue(dbError),
    } as unknown as StoresRepository;
    const tx = mockTransactionService();
    const service = new StoresService(repository, tx, new ScopeService(), {} as AuditService);

    await expect(
      service.create({ organizationScopeId: scopeId, code: 'MAIN', name: 'Main Store' }, actor),
    ).rejects.toBe(dbError);
  });

  it('rejects empty update bodies with 400 BAD_REQUEST', async () => {
    const repository = {} as StoresRepository;
    const service = new StoresService(repository, {} as TransactionService, new ScopeService(), {} as AuditService);

    await expect(service.update(storeId, {}, actor)).rejects.toMatchObject({
      statusCode: HttpStatus.BAD_REQUEST,
      code: ErrorCode.BAD_REQUEST,
    });
  });

  it('conceals out-of-scope stores with 404 NOT_FOUND on update', async () => {
    const repository = {
      findScoped: jest.fn().mockResolvedValue(null),
    } as unknown as StoresRepository;
    const tx = mockTransactionService();
    const service = new StoresService(repository, tx, new ScopeService(), {} as AuditService);

    await expect(service.update(storeId, { name: 'New Name' }, actor)).rejects.toMatchObject({
      statusCode: HttpStatus.NOT_FOUND,
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('rejects store deactivation with 409 RESOURCE_IN_USE when stock remains on-hand or reserved', async () => {
    const repository = {
      findScoped: jest.fn().mockResolvedValue(storeRow),
      hasOnHandOrReservedStock: jest.fn().mockResolvedValue(true),
      update: jest.fn(),
    } as unknown as StoresRepository;
    const tx = mockTransactionService();
    const service = new StoresService(repository, tx, new ScopeService(), {} as AuditService);

    await expect(service.update(storeId, { status: StoreStatus.INACTIVE }, actor)).rejects.toMatchObject({
      statusCode: HttpStatus.CONFLICT,
      code: ErrorCode.RESOURCE_IN_USE,
    });
    expect((repository.update as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('updates store, allows deactivation when empty, and records audit transactionally', async () => {
    const updatedRow: StoreRow = { ...storeRow, status: StoreStatus.INACTIVE };
    const findScopedMock = jest.fn().mockResolvedValue(storeRow);
    const hasOnHandOrReservedStockMock = jest.fn().mockResolvedValue(false);
    const updateMock = jest.fn().mockResolvedValue(updatedRow);
    const auditRecordMock = jest.fn().mockResolvedValue(undefined);
    const repository = {
      findScoped: findScopedMock,
      hasOnHandOrReservedStock: hasOnHandOrReservedStockMock,
      update: updateMock,
    } as unknown as StoresRepository;
    const audit = { record: auditRecordMock } as unknown as AuditService;
    const tx = mockTransactionService();
    const service = new StoresService(repository, tx, new ScopeService(), audit);

    const result = await service.update(storeId, { status: StoreStatus.INACTIVE }, actor);

    expect(result.status).toBe(StoreStatus.INACTIVE);
    expect(findScopedMock.mock.calls).toHaveLength(1);
    expect(findScopedMock.mock.calls[0][3]).toBe(true); // lock = true
    expect(updateMock.mock.calls).toHaveLength(1);
    expect(auditRecordMock.mock.calls).toHaveLength(1);
    expect(auditRecordMock.mock.calls[0][1]).toMatchObject({
      action: 'STORE.UPDATE',
      entityType: 'STORE',
      entityId: storeId,
      outcome: 'SUCCESS',
    });
  });

  it('preserves unexpected database errors unchanged on update', async () => {
    const dbError = new Error('Deadlock detected');
    const repository = {
      findScoped: jest.fn().mockResolvedValue(storeRow),
      update: jest.fn().mockRejectedValue(dbError),
    } as unknown as StoresRepository;
    const tx = mockTransactionService();
    const service = new StoresService(repository, tx, new ScopeService(), {} as AuditService);

    await expect(service.update(storeId, { name: 'New Name' }, actor)).rejects.toBe(dbError);
  });
});

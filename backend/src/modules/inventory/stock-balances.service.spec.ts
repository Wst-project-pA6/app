import { HttpStatus } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { PartStatus } from './dto/part.dto';
import { StockMovementType } from './dto/stock-balance.dto';
import { StoreStatus } from './dto/store.dto';
import { PartRow, PartsRepository } from './parts.repository';
import {
  ReconciliationRow,
  StockBalanceRow,
  StockBalancesRepository,
  StockMovementRow,
} from './stock-balances.repository';
import { StockBalancesService } from './stock-balances.service';
import { StoreRow, StoresRepository } from './stores.repository';

const scopeId = '22222222-2222-4222-8222-222222222222';
const storeId = '11111111-1111-4111-8111-111111111111';
const partId = '33333333-3333-4333-8333-333333333333';

const actorWithCost: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'storekeeper@example.test',
  displayName: 'Storekeeper',
  preferredLocale: 'en',
  roles: ['STOREKEEPER_PROCUREMENT'],
  permissions: ['inventory.read', 'inventory.cost.read', 'parts.write'],
  organizationScopeIds: [scopeId],
  mustChangePassword: false,
};

const actorWithoutCost: AuthenticatedPrincipal = {
  ...actorWithCost,
  permissions: ['inventory.read', 'parts.write'],
};

const sampleBalanceRow: StockBalanceRow = {
  store_id: storeId,
  part_id: partId,
  sku: 'FLTR-OIL-001',
  name_en: 'Oil Filter',
  name_ar: 'فلتر زيت',
  selling_price_currency: 'SAR',
  on_hand: 10,
  reserved: 3,
  min_level: 5,
  max_level: 20,
  average_cost_amount: '25.5000',
  average_cost_currency: 'SAR',
  updated_at: new Date('2026-03-01T10:00:00.000Z'),
};

const sampleStoreRow: StoreRow = {
  id: storeId,
  organization_scope_id: scopeId,
  code: 'MAIN',
  name: 'Main Warehouse',
  status: StoreStatus.ACTIVE,
  created_at: new Date(),
  updated_at: new Date(),
  created_by: actorWithCost.id,
  updated_by: actorWithCost.id,
};

const samplePartRow: PartRow = {
  id: partId,
  sku: 'FLTR-OIL-001',
  barcode: '12345678',
  name_en: 'Oil Filter',
  name_ar: 'فلتر زيت',
  category: 'Filters',
  unit_of_measure: 'EA',
  selling_price_amount: '35.0000',
  selling_price_currency: 'SAR',
  status: PartStatus.ACTIVE,
  version: 1,
  created_at: new Date(),
  updated_at: new Date(),
  created_by: actorWithCost.id,
  updated_by: actorWithCost.id,
};

const sampleMovementRow: StockMovementRow = {
  id: 'mov-11111111-1111-4111-8111-111111111111',
  store_id: storeId,
  part_id: partId,
  type: StockMovementType.RECEIPT,
  on_hand_delta: 10,
  reserved_delta: 0,
  on_hand_after: 10,
  reserved_after: 0,
  unit_cost_amount: '25.5000',
  unit_cost_currency: 'SAR',
  job_id: null,
  part_issue_id: null,
  purchase_order_id: 'po-11111111-1111-4111-8111-111111111111',
  goods_receipt_id: 'gr-11111111-1111-4111-8111-111111111111',
  stock_adjustment_id: null,
  reason: 'Goods received from PO',
  actor_id: actorWithCost.id,
  occurred_at: new Date('2026-03-01T09:00:00.000Z'),
};

const mockTransactionService = (client: unknown = {}) =>
  ({
    runInTransaction: jest.fn(async (work: (val: never) => unknown) => work(client as never)),
  }) as unknown as TransactionService;

describe('StockBalancesService', () => {
  describe('listBalances', () => {
    it('lists stock balances and computes available and belowMinimum', async () => {
      const listBalancesMock = jest
        .fn()
        .mockResolvedValue({ rows: [sampleBalanceRow], totalItems: 1 });
      const repository = { listBalances: listBalancesMock } as unknown as StockBalancesRepository;
      const service = new StockBalancesService(
        repository,
        {} as StoresRepository,
        {} as PartsRepository,
        {} as TransactionService,
        new ScopeService(),
        {} as AuditService,
      );

      const result = await service.listBalances({ page: 1, pageSize: 10 }, actorWithCost);

      expect(listBalancesMock).toHaveBeenCalledWith({ page: 1, pageSize: 10 }, [scopeId]);
      expect(result).toMatchObject({
        items: [
          {
            storeId,
            partId,
            sku: 'FLTR-OIL-001',
            partName: { en: 'Oil Filter', ar: 'فلتر زيت' },
            onHand: 10,
            reserved: 3,
            available: 7, // 10 - 3
            minLevel: 5,
            maxLevel: 20,
            belowMinimum: false, // 10 > 5
            averageCost: { amount: '25.5000', currency: 'SAR' },
          },
        ],
        page: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
      });
    });

    it('omits averageCost when caller lacks inventory.cost.read', async () => {
      const listBalancesMock = jest
        .fn()
        .mockResolvedValue({ rows: [sampleBalanceRow], totalItems: 1 });
      const repository = { listBalances: listBalancesMock } as unknown as StockBalancesRepository;
      const service = new StockBalancesService(
        repository,
        {} as StoresRepository,
        {} as PartsRepository,
        {} as TransactionService,
        new ScopeService(),
        {} as AuditService,
      );

      const result = await service.listBalances({ page: 1, pageSize: 10 }, actorWithoutCost);

      expect(result.items[0]).not.toHaveProperty('averageCost');
      expect(result.items[0].available).toBe(7);
    });

    it('correctly flags belowMinimum as true when onHand <= minLevel', async () => {
      const lowStockRow: StockBalanceRow = {
        ...sampleBalanceRow,
        on_hand: 4,
        min_level: 5,
      };
      const listBalancesMock = jest
        .fn()
        .mockResolvedValue({ rows: [lowStockRow], totalItems: 1 });
      const repository = { listBalances: listBalancesMock } as unknown as StockBalancesRepository;
      const service = new StockBalancesService(
        repository,
        {} as StoresRepository,
        {} as PartsRepository,
        {} as TransactionService,
        new ScopeService(),
        {} as AuditService,
      );

      const result = await service.listBalances({ page: 1, pageSize: 10 }, actorWithoutCost);

      expect(result.items[0].belowMinimum).toBe(true);
      expect(result.items[0].available).toBe(1); // 4 - 3
    });

    it('computes available using exact onHand - reserved without clamping', async () => {
      const negativeAvailableRow: StockBalanceRow = {
        ...sampleBalanceRow,
        on_hand: 2,
        reserved: 5,
      };
      const listBalancesMock = jest
        .fn()
        .mockResolvedValue({ rows: [negativeAvailableRow], totalItems: 1 });
      const repository = { listBalances: listBalancesMock } as unknown as StockBalancesRepository;
      const service = new StockBalancesService(
        repository,
        {} as StoresRepository,
        {} as PartsRepository,
        {} as TransactionService,
        new ScopeService(),
        {} as AuditService,
      );

      const result = await service.listBalances({ page: 1, pageSize: 10 }, actorWithoutCost);

      expect(result.items[0].available).toBe(-3); // 2 - 5 exactly, never clamped to 0
    });

    it('rejects invalid sort fields with 400 BAD_REQUEST', async () => {
      const repository = {} as StockBalancesRepository;
      const service = new StockBalancesService(
        repository,
        {} as StoresRepository,
        {} as PartsRepository,
        {} as TransactionService,
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.listBalances({ page: 1, pageSize: 10, sort: 'sellingPrice' }, actorWithCost),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.BAD_REQUEST,
        code: ErrorCode.BAD_REQUEST,
      });
    });
  });

  describe('replaceLevels', () => {
    it('updates levels in transaction and creates audit record', async () => {
      const findStoreMock = jest.fn().mockResolvedValue(sampleStoreRow);
      const findPartMock = jest.fn().mockResolvedValue(samplePartRow);
      const replaceLevelsMock = jest.fn().mockResolvedValue({
        ...sampleBalanceRow,
        min_level: 8,
        max_level: 25,
      });
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const storesRepository = { findScoped: findStoreMock } as unknown as StoresRepository;
      const partsRepository = { findById: findPartMock } as unknown as PartsRepository;
      const repository = { replaceLevels: replaceLevelsMock } as unknown as StockBalancesRepository;
      const audit = { record: auditMock } as unknown as AuditService;

      const service = new StockBalancesService(
        repository,
        storesRepository,
        partsRepository,
        mockTransactionService(),
        new ScopeService(),
        audit,
      );

      const result = await service.replaceLevels(
        storeId,
        partId,
        { minLevel: 8, maxLevel: 25 },
        actorWithCost,
      );

      expect(findStoreMock).toHaveBeenCalledWith(storeId, [scopeId], expect.anything(), true);
      expect(findPartMock).toHaveBeenCalledWith(expect.anything(), partId, true);
      expect(replaceLevelsMock).toHaveBeenCalledWith(expect.anything(), storeId, partId, 8, 25);
      expect(auditMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'STOCK_LEVELS.UPDATE',
          entityType: 'STOCK_BALANCE',
          entityId: partId,
          outcome: 'SUCCESS',
        }),
      );
      expect(result).toMatchObject({
        storeId,
        partId,
        minLevel: 8,
        maxLevel: 25,
        averageCost: { amount: '25.5000', currency: 'SAR' },
      });
    });

    it('rejects when maxLevel is less than minLevel with 422 VALIDATION_FAILED', async () => {
      const service = new StockBalancesService(
        {} as StockBalancesRepository,
        {} as StoresRepository,
        {} as PartsRepository,
        {} as TransactionService,
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.replaceLevels(storeId, partId, { minLevel: 10, maxLevel: 5 }, actorWithCost),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        code: ErrorCode.VALIDATION_FAILED,
      });
    });

    it('throws 404 NOT_FOUND when store does not exist in caller scope', async () => {
      const findStoreMock = jest.fn().mockResolvedValue(null);
      const storesRepository = { findScoped: findStoreMock } as unknown as StoresRepository;

      const service = new StockBalancesService(
        {} as StockBalancesRepository,
        storesRepository,
        {} as PartsRepository,
        mockTransactionService(),
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.replaceLevels(storeId, partId, { minLevel: 2, maxLevel: 10 }, actorWithCost),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('throws 404 NOT_FOUND when store is INACTIVE', async () => {
      const findStoreMock = jest.fn().mockResolvedValue({
        ...sampleStoreRow,
        status: StoreStatus.INACTIVE,
      });
      const storesRepository = { findScoped: findStoreMock } as unknown as StoresRepository;

      const service = new StockBalancesService(
        {} as StockBalancesRepository,
        storesRepository,
        {} as PartsRepository,
        mockTransactionService(),
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.replaceLevels(storeId, partId, { minLevel: 2, maxLevel: 10 }, actorWithCost),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('throws 404 NOT_FOUND when part does not exist', async () => {
      const findStoreMock = jest.fn().mockResolvedValue(sampleStoreRow);
      const findPartMock = jest.fn().mockResolvedValue(null);
      const storesRepository = { findScoped: findStoreMock } as unknown as StoresRepository;
      const partsRepository = { findById: findPartMock } as unknown as PartsRepository;

      const service = new StockBalancesService(
        {} as StockBalancesRepository,
        storesRepository,
        partsRepository,
        mockTransactionService(),
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.replaceLevels(storeId, partId, { minLevel: 2, maxLevel: 10 }, actorWithCost),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('throws 404 NOT_FOUND when part is ARCHIVED', async () => {
      const findStoreMock = jest.fn().mockResolvedValue(sampleStoreRow);
      const findPartMock = jest.fn().mockResolvedValue({
        ...samplePartRow,
        status: PartStatus.ARCHIVED,
      });
      const storesRepository = { findScoped: findStoreMock } as unknown as StoresRepository;
      const partsRepository = { findById: findPartMock } as unknown as PartsRepository;

      const service = new StockBalancesService(
        {} as StockBalancesRepository,
        storesRepository,
        partsRepository,
        mockTransactionService(),
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.replaceLevels(storeId, partId, { minLevel: 2, maxLevel: 10 }, actorWithCost),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('maps database chk_levels_order constraint violation to 422 VALIDATION_FAILED', async () => {
      const findStoreMock = jest.fn().mockResolvedValue(sampleStoreRow);
      const findPartMock = jest.fn().mockResolvedValue(samplePartRow);
      const replaceLevelsMock = jest.fn().mockRejectedValue({
        code: '23514',
        constraint: 'chk_levels_order',
      });

      const storesRepository = { findScoped: findStoreMock } as unknown as StoresRepository;
      const partsRepository = { findById: findPartMock } as unknown as PartsRepository;
      const repository = { replaceLevels: replaceLevelsMock } as unknown as StockBalancesRepository;

      const service = new StockBalancesService(
        repository,
        storesRepository,
        partsRepository,
        mockTransactionService(),
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.replaceLevels(storeId, partId, { minLevel: 5, maxLevel: 10 }, actorWithCost),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        code: ErrorCode.VALIDATION_FAILED,
      });
    });

    it('re-throws unexpected errors untouched', async () => {
      const findStoreMock = jest.fn().mockResolvedValue(sampleStoreRow);
      const findPartMock = jest.fn().mockResolvedValue(samplePartRow);
      const unexpectedError = new Error('Database connection failure');
      const replaceLevelsMock = jest.fn().mockRejectedValue(unexpectedError);

      const storesRepository = { findScoped: findStoreMock } as unknown as StoresRepository;
      const partsRepository = { findById: findPartMock } as unknown as PartsRepository;
      const repository = { replaceLevels: replaceLevelsMock } as unknown as StockBalancesRepository;

      const service = new StockBalancesService(
        repository,
        storesRepository,
        partsRepository,
        mockTransactionService(),
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.replaceLevels(storeId, partId, { minLevel: 5, maxLevel: 10 }, actorWithCost),
      ).rejects.toThrow(unexpectedError);
    });
  });

  describe('getReconciliation', () => {
    it('returns reconciled=true when ledger exactly matches balances', async () => {
      const reconcRows: ReconciliationRow[] = [
        {
          store_id: storeId,
          part_id: partId,
          ledger_on_hand: 10,
          balance_on_hand: 10,
          ledger_reserved: 3,
          balance_reserved: 3,
        },
      ];
      const getReconciliationMock = jest.fn().mockResolvedValue(reconcRows);
      const repository = {
        getReconciliation: getReconciliationMock,
      } as unknown as StockBalancesRepository;

      const service = new StockBalancesService(
        repository,
        {} as StoresRepository,
        {} as PartsRepository,
        {} as TransactionService,
        new ScopeService(),
        {} as AuditService,
      );

      const result = await service.getReconciliation({}, actorWithCost);

      expect(getReconciliationMock).toHaveBeenCalledWith([scopeId], undefined);
      expect(result).toMatchObject({
        checkedBalances: 1,
        mismatchCount: 0,
        reconciled: true,
        mismatches: [],
      });
    });

    it('identifies mismatches and returns reconciled=false', async () => {
      const reconcRows: ReconciliationRow[] = [
        {
          store_id: storeId,
          part_id: partId,
          ledger_on_hand: 12,
          balance_on_hand: 10,
          ledger_reserved: 3,
          balance_reserved: 3,
        },
      ];
      const getReconciliationMock = jest.fn().mockResolvedValue(reconcRows);
      const repository = {
        getReconciliation: getReconciliationMock,
      } as unknown as StockBalancesRepository;

      const service = new StockBalancesService(
        repository,
        {} as StoresRepository,
        {} as PartsRepository,
        {} as TransactionService,
        new ScopeService(),
        {} as AuditService,
      );

      const result = await service.getReconciliation({}, actorWithCost);

      expect(result).toMatchObject({
        checkedBalances: 1,
        mismatchCount: 1,
        reconciled: false,
        mismatches: [
          {
            storeId,
            partId,
            ledgerOnHand: 12,
            balanceOnHand: 10,
            ledgerReserved: 3,
            balanceReserved: 3,
          },
        ],
      });
    });

    it('verifies store access and passes storeId filter', async () => {
      const findStoreMock = jest.fn().mockResolvedValue(sampleStoreRow);
      const storesRepository = { findScoped: findStoreMock } as unknown as StoresRepository;
      const getReconciliationMock = jest.fn().mockResolvedValue([]);
      const repository = {
        getReconciliation: getReconciliationMock,
      } as unknown as StockBalancesRepository;

      const service = new StockBalancesService(
        repository,
        storesRepository,
        {} as PartsRepository,
        {} as TransactionService,
        new ScopeService(),
        {} as AuditService,
      );

      await service.getReconciliation({ storeId }, actorWithCost);

      expect(findStoreMock).toHaveBeenCalledWith(storeId, [scopeId]);
      expect(getReconciliationMock).toHaveBeenCalledWith([scopeId], storeId);
    });

    it('throws 404 NOT_FOUND when storeId filter refers to inaccessible store', async () => {
      const findStoreMock = jest.fn().mockResolvedValue(null);
      const storesRepository = { findScoped: findStoreMock } as unknown as StoresRepository;

      const service = new StockBalancesService(
        {} as StockBalancesRepository,
        storesRepository,
        {} as PartsRepository,
        {} as TransactionService,
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.getReconciliation({ storeId }, actorWithCost),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
    });
  });

  describe('listMovements', () => {
    it('lists stock movements and maps fields with unitCost when permission granted', async () => {
      const listMovementsMock = jest
        .fn()
        .mockResolvedValue({ rows: [sampleMovementRow], totalItems: 1 });
      const repository = {
        listMovements: listMovementsMock,
      } as unknown as StockBalancesRepository;

      const service = new StockBalancesService(
        repository,
        {} as StoresRepository,
        {} as PartsRepository,
        {} as TransactionService,
        new ScopeService(),
        {} as AuditService,
      );

      const result = await service.listMovements({ page: 1, pageSize: 10 }, actorWithCost);

      expect(listMovementsMock).toHaveBeenCalledWith({ page: 1, pageSize: 10 }, [scopeId]);
      expect(result).toMatchObject({
        items: [
          {
            id: 'mov-11111111-1111-4111-8111-111111111111',
            storeId,
            partId,
            type: StockMovementType.RECEIPT,
            onHandDelta: 10,
            reservedDelta: 0,
            onHandAfter: 10,
            reservedAfter: 0,
            unitCost: { amount: '25.5000', currency: 'SAR' },
            purchaseOrderId: 'po-11111111-1111-4111-8111-111111111111',
            goodsReceiptId: 'gr-11111111-1111-4111-8111-111111111111',
            reason: 'Goods received from PO',
            actorId: actorWithCost.id,
          },
        ],
        page: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
      });
    });

    it('omits unitCost when caller lacks inventory.cost.read', async () => {
      const listMovementsMock = jest
        .fn()
        .mockResolvedValue({ rows: [sampleMovementRow], totalItems: 1 });
      const repository = {
        listMovements: listMovementsMock,
      } as unknown as StockBalancesRepository;

      const service = new StockBalancesService(
        repository,
        {} as StoresRepository,
        {} as PartsRepository,
        {} as TransactionService,
        new ScopeService(),
        {} as AuditService,
      );

      const result = await service.listMovements({ page: 1, pageSize: 10 }, actorWithoutCost);

      expect(result.items[0]).not.toHaveProperty('unitCost');
    });

    it('rejects invalid sort field for movements with 400 BAD_REQUEST', async () => {
      const service = new StockBalancesService(
        {} as StockBalancesRepository,
        {} as StoresRepository,
        {} as PartsRepository,
        {} as TransactionService,
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.listMovements({ page: 1, pageSize: 10, sort: 'onHandDelta' }, actorWithCost),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.BAD_REQUEST,
        code: ErrorCode.BAD_REQUEST,
      });
    });

    it('rejects when from is equal to or after to date with 400 BAD_REQUEST', async () => {
      const service = new StockBalancesService(
        {} as StockBalancesRepository,
        {} as StoresRepository,
        {} as PartsRepository,
        {} as TransactionService,
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.listMovements(
          {
            page: 1,
            pageSize: 10,
            from: '2026-03-05T00:00:00.000Z',
            to: '2026-03-01T00:00:00.000Z',
          },
          actorWithCost,
        ),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.BAD_REQUEST,
        code: ErrorCode.BAD_REQUEST,
      });
    });
  });
});

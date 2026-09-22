import 'reflect-metadata';
import { HttpStatus } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  StockAdjustmentCreateRequest,
  StockAdjustmentDecision,
  StockAdjustmentDecisionRequest,
  StockAdjustmentReasonCode,
  StockAdjustmentStatus,
} from './dto/stock-adjustment.dto';
import { PartRow, PartStatus } from './dto/part.dto';
import { StoreRow, StoreStatus } from './dto/store.dto';
import { PartsRepository } from './parts.repository';
import {
  AdjustmentStockBalanceRow,
  StockAdjustmentRow,
  StockAdjustmentsRepository,
} from './stock-adjustments.repository';
import { StockAdjustmentsService } from './stock-adjustments.service';
import { StoresRepository } from './stores.repository';

describe('StockAdjustmentsService', () => {
  const scopeId = '22222222-2222-4222-8222-222222222222';
  const storeId = '33333333-3333-4333-8333-333333333333';
  const partId = '44444444-4444-4444-8444-444444444444';
  const adjustmentId = '55555555-5555-4555-8555-555555555555';
  const movementId = '66666666-6666-4666-8666-666666666666';

  const requesterActor: AuthenticatedPrincipal = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'requester@example.test',
    displayName: 'Requester',
    preferredLocale: 'en',
    roles: ['STOREKEEPER_PROCUREMENT'],
    permissions: ['inventory.adjust'],
    organizationScopeIds: [scopeId],
    mustChangePassword: false,
  };

  const approverActor: AuthenticatedPrincipal = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    email: 'approver@example.test',
    displayName: 'Approver',
    preferredLocale: 'en',
    roles: ['WORKSHOP_MANAGER'],
    permissions: ['inventory.adjust.approve'],
    organizationScopeIds: [scopeId],
    mustChangePassword: false,
  };

  const sampleStore: StoreRow = {
    id: storeId,
    organization_scope_id: scopeId,
    code: 'MAIN',
    name: 'Main Store',
    status: StoreStatus.ACTIVE,
    created_at: new Date('2026-09-01T00:00:00Z'),
    updated_at: new Date('2026-09-01T00:00:00Z'),
    created_by: requesterActor.id,
    updated_by: requesterActor.id,
  };

  const samplePart: PartRow = {
    id: partId,
    sku: 'BRK-001',
    barcode: null,
    name_en: 'Brake Pad',
    name_ar: null,
    category: 'BRAKES',
    unit_of_measure: 'PCS',
    selling_price_amount: '50.0000',
    selling_price_currency: 'SAR',
    status: PartStatus.ACTIVE,
    version: 1,
    created_at: new Date('2026-09-01T00:00:00Z'),
    updated_at: new Date('2026-09-01T00:00:00Z'),
    created_by: requesterActor.id,
    updated_by: requesterActor.id,
  };

  const sampleAdjustment: StockAdjustmentRow = {
    id: adjustmentId,
    store_id: storeId,
    part_id: partId,
    quantity_delta: 5,
    reason_code: StockAdjustmentReasonCode.FOUND,
    note: 'Found in store room',
    status: StockAdjustmentStatus.PENDING_APPROVAL,
    requested_by: requesterActor.id,
    decided_by: null,
    decided_at: null,
    decision_reason: null,
    stock_movement_id: null,
    idempotency_key: null,
    created_at: new Date('2026-09-01T00:00:00Z'),
    updated_at: new Date('2026-09-01T00:00:00Z'),
  };

  const sampleBalance: AdjustmentStockBalanceRow = {
    store_id: storeId,
    part_id: partId,
    on_hand: 10,
    reserved: 2,
    min_level: 5,
    max_level: 50,
    average_cost_amount: '20.0000',
    average_cost_currency: 'SAR',
  };

  function buildService(overrides: {
    repository?: Partial<StockAdjustmentsRepository>;
    storesRepository?: Partial<StoresRepository>;
    partsRepository?: Partial<PartsRepository>;
    transaction?: Partial<TransactionService>;
    scopeService?: Partial<ScopeService>;
    audit?: Partial<AuditService>;
  }) {
    const repository = {
      list: jest.fn().mockResolvedValue({ rows: [sampleAdjustment], totalItems: 1 }),
      acquireIdempotencyLock: jest.fn().mockResolvedValue(undefined),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(sampleAdjustment),
      lockAdjustment: jest.fn().mockResolvedValue(sampleAdjustment),
      lockBalance: jest.fn().mockResolvedValue(sampleBalance),
      initZeroBalance: jest.fn().mockResolvedValue(undefined),
      updateBalanceOnHand: jest.fn().mockResolvedValue(undefined),
      createAdjustmentMovement: jest.fn().mockResolvedValue(movementId),
      applyDecision: jest.fn().mockResolvedValue({
        ...sampleAdjustment,
        status: StockAdjustmentStatus.APPROVED,
        decided_by: approverActor.id,
        decided_at: new Date(),
        stock_movement_id: movementId,
      }),
      ...overrides.repository,
    } as unknown as StockAdjustmentsRepository;

    const storesRepository = {
      findScoped: jest.fn().mockResolvedValue(sampleStore),
      ...overrides.storesRepository,
    } as unknown as StoresRepository;

    const partsRepository = {
      findById: jest.fn().mockResolvedValue(samplePart),
      ...overrides.partsRepository,
    } as unknown as PartsRepository;

    const client = { query: jest.fn() };
    const transaction = {
      runInTransaction: jest.fn(async (work: (val: never) => unknown) => work(client as never)),
      ...overrides.transaction,
    } as unknown as TransactionService;

    const scopeService = {
      allowedScopeIds: jest.fn().mockReturnValue([scopeId]),
      ...overrides.scopeService,
    } as unknown as ScopeService;

    const audit = {
      record: jest.fn().mockResolvedValue(undefined),
      ...overrides.audit,
    } as unknown as AuditService;

    return new StockAdjustmentsService(
      repository,
      storesRepository,
      partsRepository,
      transaction,
      scopeService,
      audit,
    );
  }

  describe('list', () => {
    it('lists stock adjustments with scope enforcement, pagination, and exact response mapping', async () => {
      const listMock = jest.fn().mockResolvedValue({ rows: [sampleAdjustment], totalItems: 1 });
      const service = buildService({ repository: { list: listMock } });

      const result = await service.list({ page: 1, pageSize: 20 }, requesterActor);

      expect(listMock).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, [scopeId]);
      expect(result).toMatchObject({
        items: [
          {
            id: adjustmentId,
            storeId,
            partId,
            quantityDelta: 5,
            reasonCode: StockAdjustmentReasonCode.FOUND,
            note: 'Found in store room',
            status: StockAdjustmentStatus.PENDING_APPROVAL,
            createdBy: requesterActor.id,
            updatedBy: requesterActor.id,
          },
        ],
        page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      });
      // Ensure internal idempotency_key is not exposed
      expect(result.items[0]).not.toHaveProperty('idempotencyKey');
      expect(result.items[0]).not.toHaveProperty('idempotency_key');
    });

    it('filters by status, storeId, and partId', async () => {
      const listMock = jest.fn().mockResolvedValue({ rows: [], totalItems: 0 });
      const service = buildService({ repository: { list: listMock } });

      await service.list(
        {
          page: 1,
          pageSize: 20,
          status: StockAdjustmentStatus.PENDING_APPROVAL,
          storeId,
          partId,
        },
        requesterActor,
      );

      expect(listMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: StockAdjustmentStatus.PENDING_APPROVAL,
          storeId,
          partId,
        }),
        [scopeId],
      );
    });

    it('rejects an unknown sort field with 400 BAD_REQUEST', async () => {
      const service = buildService({});

      await expect(
        service.list({ page: 1, pageSize: 20, sort: 'quantity' }, requesterActor),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.BAD_REQUEST,
        code: ErrorCode.BAD_REQUEST,
      });
    });

    it('accepts valid sort fields createdAt and -createdAt', async () => {
      const listMock = jest.fn().mockResolvedValue({ rows: [], totalItems: 0 });
      const service = buildService({ repository: { list: listMock } });

      await service.list({ page: 1, pageSize: 20, sort: '-createdAt' }, requesterActor);
      expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ sort: '-createdAt' }), [
        scopeId,
      ]);

      await service.list({ page: 1, pageSize: 20, sort: 'createdAt' }, requesterActor);
      expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ sort: 'createdAt' }), [
        scopeId,
      ]);
    });

    it('returns empty collection without error (not 403) when actor has no active scopes', async () => {
      const listMock = jest.fn().mockResolvedValue({ rows: [], totalItems: 0 });
      const service = buildService({
        repository: { list: listMock },
        scopeService: { allowedScopeIds: jest.fn().mockReturnValue([]) },
      });

      const result = await service.list({ page: 1, pageSize: 20 }, requesterActor);

      expect(listMock).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, []);
      expect(result).toEqual({
        items: [],
        page: {
          page: 1,
          pageSize: 20,
          totalItems: 0,
          totalPages: 0,
        },
      });
    });
  });

  describe('create', () => {
    const validDto: StockAdjustmentCreateRequest = {
      storeId,
      partId,
      quantityDelta: 5,
      reasonCode: StockAdjustmentReasonCode.FOUND,
      note: 'Found in store room',
    };

    it('creates a PENDING_APPROVAL stock adjustment without balance change or movement', async () => {
      const createMock = jest.fn().mockResolvedValue(sampleAdjustment);
      const auditMock = jest.fn().mockResolvedValue(undefined);
      const lockBalanceMock = jest.fn();
      const createMovementMock = jest.fn();

      const service = buildService({
        repository: {
          create: createMock,
          lockBalance: lockBalanceMock,
          createAdjustmentMovement: createMovementMock,
        },
        audit: { record: auditMock },
      });

      const result = await service.create(validDto, requesterActor, undefined);

      expect(result).toMatchObject({
        id: adjustmentId,
        storeId,
        partId,
        quantityDelta: 5,
        status: StockAdjustmentStatus.PENDING_APPROVAL,
        createdBy: requesterActor.id,
      });

      expect(createMock).toHaveBeenCalledWith(expect.anything(), {
        storeId,
        partId,
        quantityDelta: 5,
        reasonCode: StockAdjustmentReasonCode.FOUND,
        note: 'Found in store room',
        requestedBy: requesterActor.id,
        idempotencyKey: undefined,
      });

      // Crucial: No balance change and no movement on request
      expect(lockBalanceMock).not.toHaveBeenCalled();
      expect(createMovementMock).not.toHaveBeenCalled();

      // Transactional audit event
      expect(auditMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'STOCK_ADJUSTMENT.CREATE',
          entityType: 'STOCK_ADJUSTMENT',
          entityId: adjustmentId,
          outcome: 'SUCCESS',
        }),
      );
    });

    it('conceals store outside active scope with 404 NOT_FOUND', async () => {
      const findStoreMock = jest.fn().mockResolvedValue(null);
      const service = buildService({ storesRepository: { findScoped: findStoreMock } });

      await expect(service.create(validDto, requesterActor, undefined)).rejects.toMatchObject({
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('conceals inactive store with 404 NOT_FOUND', async () => {
      const findStoreMock = jest
        .fn()
        .mockResolvedValue({ ...sampleStore, status: StoreStatus.INACTIVE });
      const service = buildService({ storesRepository: { findScoped: findStoreMock } });

      await expect(service.create(validDto, requesterActor, undefined)).rejects.toMatchObject({
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('conceals inactive or missing part with 404 NOT_FOUND', async () => {
      const findPartMock = jest.fn().mockResolvedValue(null);
      const service = buildService({ partsRepository: { findById: findPartMock } });

      await expect(service.create(validDto, requesterActor, undefined)).rejects.toMatchObject({
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });

      findPartMock.mockResolvedValue({ ...samplePart, status: PartStatus.ARCHIVED });
      await expect(service.create(validDto, requesterActor, undefined)).rejects.toMatchObject({
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
    });

    describe('idempotency', () => {
      it('replays same-caller, same-key, same-body request without creating duplicate or audit', async () => {
        const existingAdjustment: StockAdjustmentRow = {
          ...sampleAdjustment,
          idempotency_key: 'valid-key-123',
        };
        const findByKeyMock = jest.fn().mockResolvedValue(existingAdjustment);
        const createMock = jest.fn();
        const auditMock = jest.fn();

        const service = buildService({
          repository: {
            findByIdempotencyKey: findByKeyMock,
            create: createMock,
          },
          audit: { record: auditMock },
        });

        const result = await service.create(validDto, requesterActor, 'valid-key-123');

        expect(result).toMatchObject({ id: adjustmentId });
        expect(createMock).not.toHaveBeenCalled();
        expect(auditMock).not.toHaveBeenCalled();
      });

      it('re-evaluates scope check on replay and conceals out-of-scope store with 404', async () => {
        const existingAdjustment: StockAdjustmentRow = {
          ...sampleAdjustment,
          idempotency_key: 'valid-key-123',
        };
        const findByKeyMock = jest.fn().mockResolvedValue(existingAdjustment);
        const findStoreMock = jest.fn().mockResolvedValue(null); // store not in scope

        const service = buildService({
          repository: { findByIdempotencyKey: findByKeyMock },
          storesRepository: { findScoped: findStoreMock },
        });

        await expect(service.create(validDto, requesterActor, 'valid-key-123')).rejects.toMatchObject(
          {
            statusCode: HttpStatus.NOT_FOUND,
            code: ErrorCode.NOT_FOUND,
          },
        );
      });

      it('rejects same-key request with different body with 409 IDEMPOTENCY_CONFLICT', async () => {
        const existingAdjustment: StockAdjustmentRow = {
          ...sampleAdjustment,
          quantity_delta: 99, // different from validDto.quantityDelta = 5
          idempotency_key: 'valid-key-123',
        };
        const findByKeyMock = jest.fn().mockResolvedValue(existingAdjustment);

        const service = buildService({
          repository: { findByIdempotencyKey: findByKeyMock },
        });

        await expect(service.create(validDto, requesterActor, 'valid-key-123')).rejects.toMatchObject(
          {
            statusCode: HttpStatus.CONFLICT,
            code: ErrorCode.IDEMPOTENCY_CONFLICT,
          },
        );
      });

      it('rejects same-key request from different caller with 409 IDEMPOTENCY_CONFLICT', async () => {
        const existingAdjustment: StockAdjustmentRow = {
          ...sampleAdjustment,
          requested_by: 'someone-else',
          idempotency_key: 'valid-key-123',
        };
        const findByKeyMock = jest.fn().mockResolvedValue(existingAdjustment);

        const service = buildService({
          repository: { findByIdempotencyKey: findByKeyMock },
        });

        await expect(service.create(validDto, requesterActor, 'valid-key-123')).rejects.toMatchObject(
          {
            statusCode: HttpStatus.CONFLICT,
            code: ErrorCode.IDEMPOTENCY_CONFLICT,
          },
        );
      });

      it('serializes concurrent same-key requests by acquiring advisory lock before lookup', async () => {
        const acquireLockMock = jest.fn().mockResolvedValue(undefined);
        const findByKeyMock = jest.fn().mockResolvedValue(null);

        const service = buildService({
          repository: {
            acquireIdempotencyLock: acquireLockMock,
            findByIdempotencyKey: findByKeyMock,
          },
        });

        await service.create(validDto, requesterActor, 'valid-key-123');

        expect(acquireLockMock).toHaveBeenCalledWith(
          expect.anything(),
          'stock_adjustment',
          'valid-key-123',
        );
        const lockOrder = acquireLockMock.mock.invocationCallOrder[0];
        const findOrder = findByKeyMock.mock.invocationCallOrder[0];
        expect(lockOrder).toBeLessThan(findOrder);
      });

      it('maps uq_adjustments_idempotency race condition to 409 IDEMPOTENCY_CONFLICT', async () => {
        const dbError = { code: '23505', constraint: 'uq_adjustments_idempotency' };
        const createMock = jest.fn().mockRejectedValue(dbError);

        const service = buildService({
          repository: { create: createMock },
        });

        await expect(service.create(validDto, requesterActor, 'valid-key-123')).rejects.toMatchObject(
          {
            statusCode: HttpStatus.CONFLICT,
            code: ErrorCode.IDEMPOTENCY_CONFLICT,
          },
        );
      });
    });
  });

  describe('decide', () => {
    const approveDto: StockAdjustmentDecisionRequest = {
      decision: StockAdjustmentDecision.APPROVED,
      reason: 'Physical count verified',
    };

    const rejectDto: StockAdjustmentDecisionRequest = {
      decision: StockAdjustmentDecision.REJECTED,
      reason: 'Discrepancy explanation insufficient',
    };

    it('conceals inaccessible adjustment with 404 NOT_FOUND', async () => {
      const lockAdjustmentMock = jest.fn().mockResolvedValue(null);
      const service = buildService({ repository: { lockAdjustment: lockAdjustmentMock } });

      await expect(service.decide(adjustmentId, approveDto, approverActor)).rejects.toMatchObject({
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
      expect(lockAdjustmentMock).toHaveBeenCalledWith(expect.anything(), adjustmentId, [scopeId]);
    });

    it('rejects already decided adjustment (both APPROVED and REJECTED) with 409 INVALID_STATE_TRANSITION', async () => {
      const alreadyApproved = {
        ...sampleAdjustment,
        status: StockAdjustmentStatus.APPROVED,
      };
      const lockAdjustmentMock = jest.fn().mockResolvedValue(alreadyApproved);
      const service = buildService({ repository: { lockAdjustment: lockAdjustmentMock } });

      await expect(service.decide(adjustmentId, approveDto, approverActor)).rejects.toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.INVALID_STATE_TRANSITION,
      });

      const alreadyRejected = {
        ...sampleAdjustment,
        status: StockAdjustmentStatus.REJECTED,
      };
      lockAdjustmentMock.mockResolvedValue(alreadyRejected);

      await expect(service.decide(adjustmentId, approveDto, approverActor)).rejects.toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.INVALID_STATE_TRANSITION,
      });
      await expect(service.decide(adjustmentId, rejectDto, approverActor)).rejects.toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.INVALID_STATE_TRANSITION,
      });
    });

    it('rejects approval or rejection when approver is same as requester with 409 SEPARATION_OF_DUTIES_VIOLATION', async () => {
      // approverActor.id equals sampleAdjustment.requested_by
      const selfApprovalAdjustment = {
        ...sampleAdjustment,
        requested_by: approverActor.id,
      };
      const lockAdjustmentMock = jest.fn().mockResolvedValue(selfApprovalAdjustment);
      const service = buildService({ repository: { lockAdjustment: lockAdjustmentMock } });

      await expect(service.decide(adjustmentId, approveDto, approverActor)).rejects.toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.SEPARATION_OF_DUTIES_VIOLATION,
      });

      await expect(service.decide(adjustmentId, rejectDto, approverActor)).rejects.toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.SEPARATION_OF_DUTIES_VIOLATION,
      });
    });

    it('maps chk_adjustment_separation_of_duties DB constraint to 409 SEPARATION_OF_DUTIES_VIOLATION', async () => {
      const dbError = { code: '23514', constraint: 'chk_adjustment_separation_of_duties' };
      const applyDecisionMock = jest.fn().mockRejectedValue(dbError);

      const service = buildService({
        repository: { applyDecision: applyDecisionMock },
      });

      await expect(service.decide(adjustmentId, approveDto, approverActor)).rejects.toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.SEPARATION_OF_DUTIES_VIOLATION,
      });
    });

    it('rejection updates status, reason, sets stockMovementId null, and produces NO movement or balance update', async () => {
      const lockBalanceMock = jest.fn();
      const createMovementMock = jest.fn();
      const updateBalanceMock = jest.fn();
      const applyDecisionMock = jest.fn().mockResolvedValue({
        ...sampleAdjustment,
        status: StockAdjustmentStatus.REJECTED,
        decided_by: approverActor.id,
        decided_at: new Date(),
        decision_reason: 'Discrepancy explanation insufficient',
        stock_movement_id: null,
      });
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const service = buildService({
        repository: {
          lockBalance: lockBalanceMock,
          createAdjustmentMovement: createMovementMock,
          updateBalanceOnHand: updateBalanceMock,
          applyDecision: applyDecisionMock,
        },
        audit: { record: auditMock },
      });

      const result = await service.decide(adjustmentId, rejectDto, approverActor);

      expect(result).toMatchObject({
        id: adjustmentId,
        status: StockAdjustmentStatus.REJECTED,
        decidedBy: approverActor.id,
        decisionReason: 'Discrepancy explanation insufficient',
      });
      expect(result).not.toHaveProperty('stockMovementId');

      expect(applyDecisionMock).toHaveBeenCalledWith(expect.anything(), {
        adjustmentId,
        status: StockAdjustmentStatus.REJECTED,
        decidedBy: approverActor.id,
        decisionReason: 'Discrepancy explanation insufficient',
      });

      // No movement and no balance change on rejection
      expect(lockBalanceMock).not.toHaveBeenCalled();
      expect(createMovementMock).not.toHaveBeenCalled();
      expect(updateBalanceMock).not.toHaveBeenCalled();

      expect(auditMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'STOCK_ADJUSTMENT.REJECT',
          entityType: 'STOCK_ADJUSTMENT',
          entityId: adjustmentId,
        }),
      );
    });

    it('approves a positive adjustment, locks in order (adjustment then balance), updates balance and appends ADJUSTMENT movement', async () => {
      const lockAdjustmentMock = jest.fn().mockResolvedValue(sampleAdjustment); // quantity_delta: 5
      const lockBalanceMock = jest.fn().mockResolvedValue(sampleBalance); // on_hand: 10, reserved: 2
      const updateBalanceMock = jest.fn().mockResolvedValue(undefined);
      const createMovementMock = jest.fn().mockResolvedValue(movementId);
      const applyDecisionMock = jest.fn().mockResolvedValue({
        ...sampleAdjustment,
        status: StockAdjustmentStatus.APPROVED,
        decided_by: approverActor.id,
        decided_at: new Date(),
        decision_reason: 'Physical count verified',
        stock_movement_id: movementId,
      });
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const service = buildService({
        repository: {
          lockAdjustment: lockAdjustmentMock,
          lockBalance: lockBalanceMock,
          updateBalanceOnHand: updateBalanceMock,
          createAdjustmentMovement: createMovementMock,
          applyDecision: applyDecisionMock,
        },
        audit: { record: auditMock },
      });

      const result = await service.decide(adjustmentId, approveDto, approverActor);

      expect(result).toMatchObject({
        id: adjustmentId,
        status: StockAdjustmentStatus.APPROVED,
        decidedBy: approverActor.id,
        decisionReason: 'Physical count verified',
        stockMovementId: movementId,
      });

      // Deterministic lock order: adjustment first, then balance
      const adjLockOrder = lockAdjustmentMock.mock.invocationCallOrder[0];
      const balLockOrder = lockBalanceMock.mock.invocationCallOrder[0];
      expect(adjLockOrder).toBeLessThan(balLockOrder);

      // Movement delta and after-values
      expect(createMovementMock).toHaveBeenCalledWith(expect.anything(), {
        storeId,
        partId,
        onHandDelta: 5,
        onHandAfter: 15,
        reservedAfter: 2,
        unitCostAmount: '20.0000',
        unitCostCurrency: 'SAR',
        stockAdjustmentId: adjustmentId,
        reason: 'Stock adjustment (FOUND) - Decision: Physical count verified',
        actorId: approverActor.id,
      });

      // Materialized balance updated with newOnHand = 15; reserved preserved
      expect(updateBalanceMock).toHaveBeenCalledWith(expect.anything(), storeId, partId, 15);

      expect(auditMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'STOCK_ADJUSTMENT.APPROVE',
          entityType: 'STOCK_ADJUSTMENT',
          entityId: adjustmentId,
          outcome: 'SUCCESS',
        }),
      );
    });

    it('approves a negative adjustment within available stock', async () => {
      const negativeAdjustment: StockAdjustmentRow = {
        ...sampleAdjustment,
        quantity_delta: -4,
        reason_code: StockAdjustmentReasonCode.LOSS,
      };
      const lockAdjustmentMock = jest.fn().mockResolvedValue(negativeAdjustment);
      const lockBalanceMock = jest.fn().mockResolvedValue(sampleBalance); // on_hand: 10, reserved: 2 -> newOnHand: 6 >= 2
      const updateBalanceMock = jest.fn().mockResolvedValue(undefined);
      const createMovementMock = jest.fn().mockResolvedValue(movementId);

      const service = buildService({
        repository: {
          lockAdjustment: lockAdjustmentMock,
          lockBalance: lockBalanceMock,
          updateBalanceOnHand: updateBalanceMock,
          createAdjustmentMovement: createMovementMock,
        },
      });

      await service.decide(adjustmentId, approveDto, approverActor);

      expect(createMovementMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          onHandDelta: -4,
          onHandAfter: 6,
          reservedAfter: 2,
        }),
      );
      expect(updateBalanceMock).toHaveBeenCalledWith(expect.anything(), storeId, partId, 6);
    });

    it('rejects approval with 409 INSUFFICIENT_STOCK if on-hand would fall below zero', async () => {
      const excessiveNegativeAdj: StockAdjustmentRow = {
        ...sampleAdjustment,
        quantity_delta: -15,
      };
      const lockAdjustmentMock = jest.fn().mockResolvedValue(excessiveNegativeAdj);
      const lockBalanceMock = jest.fn().mockResolvedValue(sampleBalance); // on_hand: 10 -> newOnHand: -5 < 0
      const createMovementMock = jest.fn();

      const service = buildService({
        repository: {
          lockAdjustment: lockAdjustmentMock,
          lockBalance: lockBalanceMock,
          createAdjustmentMovement: createMovementMock,
        },
      });

      await expect(service.decide(adjustmentId, approveDto, approverActor)).rejects.toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.INSUFFICIENT_STOCK,
      });

      expect(createMovementMock).not.toHaveBeenCalled();
    });

    it('rejects approval with 409 INSUFFICIENT_STOCK if on-hand would fall below reserved', async () => {
      const belowReservedAdj: StockAdjustmentRow = {
        ...sampleAdjustment,
        quantity_delta: -9,
      };
      const lockAdjustmentMock = jest.fn().mockResolvedValue(belowReservedAdj);
      const lockBalanceMock = jest.fn().mockResolvedValue(sampleBalance); // on_hand: 10, reserved: 2 -> newOnHand: 1 < 2
      const createMovementMock = jest.fn();

      const service = buildService({
        repository: {
          lockAdjustment: lockAdjustmentMock,
          lockBalance: lockBalanceMock,
          createAdjustmentMovement: createMovementMock,
        },
      });

      await expect(service.decide(adjustmentId, approveDto, approverActor)).rejects.toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.INSUFFICIENT_STOCK,
      });

      expect(createMovementMock).not.toHaveBeenCalled();
    });

    it('rejects approval with 409 INSUFFICIENT_STOCK when onHand = 10, reserved = 8, quantityDelta = -3 (newOnHand = 7 < reserved), with no movement, balance update, decision update, or audit event', async () => {
      const adjustmentWithDeltaMinus3: StockAdjustmentRow = {
        ...sampleAdjustment,
        quantity_delta: -3,
      };
      const balanceWithReserved8: AdjustmentStockBalanceRow = {
        ...sampleBalance,
        on_hand: 10,
        reserved: 8,
      };
      const lockAdjustmentMock = jest.fn().mockResolvedValue(adjustmentWithDeltaMinus3);
      const lockBalanceMock = jest.fn().mockResolvedValue(balanceWithReserved8);
      const createMovementMock = jest.fn();
      const updateBalanceMock = jest.fn();
      const applyDecisionMock = jest.fn();
      const auditMock = jest.fn();

      const service = buildService({
        repository: {
          lockAdjustment: lockAdjustmentMock,
          lockBalance: lockBalanceMock,
          createAdjustmentMovement: createMovementMock,
          updateBalanceOnHand: updateBalanceMock,
          applyDecision: applyDecisionMock,
        },
        audit: { record: auditMock },
      });

      await expect(service.decide(adjustmentId, approveDto, approverActor)).rejects.toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.INSUFFICIENT_STOCK,
      });

      expect(createMovementMock).not.toHaveBeenCalled();
      expect(updateBalanceMock).not.toHaveBeenCalled();
      expect(applyDecisionMock).not.toHaveBeenCalled();
      expect(auditMock).not.toHaveBeenCalled();
    });

    describe('missing balance behavior', () => {
      it('rejects negative adjustment with 409 INSUFFICIENT_STOCK when balance row does not exist', async () => {
        const negativeAdj: StockAdjustmentRow = {
          ...sampleAdjustment,
          quantity_delta: -2,
        };
        const lockAdjustmentMock = jest.fn().mockResolvedValue(negativeAdj);
        const lockBalanceMock = jest.fn().mockResolvedValue(null); // Missing balance
        const initZeroBalanceMock = jest.fn();
        const createMovementMock = jest.fn();

        const service = buildService({
          repository: {
            lockAdjustment: lockAdjustmentMock,
            lockBalance: lockBalanceMock,
            initZeroBalance: initZeroBalanceMock,
            createAdjustmentMovement: createMovementMock,
          },
        });

        await expect(service.decide(adjustmentId, approveDto, approverActor)).rejects.toMatchObject({
          statusCode: HttpStatus.CONFLICT,
          code: ErrorCode.INSUFFICIENT_STOCK,
        });

        // Never initializes a balance for negative adjustment
        expect(initZeroBalanceMock).not.toHaveBeenCalled();
        expect(createMovementMock).not.toHaveBeenCalled();
      });

      it('safely initializes zero balance atomically and creates ADJUSTMENT movement for positive adjustment when balance row does not exist', async () => {
        const positiveAdj: StockAdjustmentRow = {
          ...sampleAdjustment,
          quantity_delta: 5,
        };
        const lockAdjustmentMock = jest.fn().mockResolvedValue(positiveAdj);

        // First lockBalance returns null (missing balance).
        // After initZeroBalance, second lockBalance returns initialized zero balance.
        const initializedBalance: AdjustmentStockBalanceRow = {
          store_id: storeId,
          part_id: partId,
          on_hand: 0,
          reserved: 0,
          min_level: 0,
          max_level: 0,
          average_cost_amount: '0',
          average_cost_currency: null,
        };
        const lockBalanceMock = jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(initializedBalance);
        const initZeroBalanceMock = jest.fn().mockResolvedValue(undefined);
        const createMovementMock = jest.fn().mockResolvedValue(movementId);
        const updateBalanceMock = jest.fn().mockResolvedValue(undefined);

        const service = buildService({
          repository: {
            lockAdjustment: lockAdjustmentMock,
            lockBalance: lockBalanceMock,
            initZeroBalance: initZeroBalanceMock,
            createAdjustmentMovement: createMovementMock,
            updateBalanceOnHand: updateBalanceMock,
          },
        });

        await service.decide(adjustmentId, approveDto, approverActor);

        expect(initZeroBalanceMock).toHaveBeenCalledWith(expect.anything(), storeId, partId);
        expect(lockBalanceMock).toHaveBeenCalledTimes(2);

        // Movement reflects exact delta and new on_hand
        expect(createMovementMock).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            onHandDelta: 5,
            onHandAfter: 5,
            reservedAfter: 0,
            unitCostAmount: null,
            unitCostCurrency: null,
          }),
        );
        expect(updateBalanceMock).toHaveBeenCalledWith(expect.anything(), storeId, partId, 5);
      });
    });

    it('maps DB constraint chk_reserved_lte_on_hand to 409 INSUFFICIENT_STOCK', async () => {
      const dbError = { code: '23514', constraint: 'chk_reserved_lte_on_hand' };
      const updateBalanceMock = jest.fn().mockRejectedValue(dbError);

      const service = buildService({
        repository: { updateBalanceOnHand: updateBalanceMock },
      });

      await expect(service.decide(adjustmentId, approveDto, approverActor)).rejects.toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.INSUFFICIENT_STOCK,
      });
    });

    it('rethrows unexpected database errors untouched', async () => {
      const unexpectedError = new Error('Database connection reset');
      const lockAdjustmentMock = jest.fn().mockRejectedValue(unexpectedError);

      const service = buildService({
        repository: { lockAdjustment: lockAdjustmentMock },
      });

      await expect(service.decide(adjustmentId, approveDto, approverActor)).rejects.toThrow(
        unexpectedError,
      );
    });

    it('preserves unrelated or assumed check-constraint error (e.g. chk_stock_balances_on_hand) unchanged', async () => {
      const assumedCheckError = { code: '23514', constraint: 'chk_stock_balances_on_hand' };
      const lockAdjustmentMock = jest.fn().mockRejectedValue(assumedCheckError);

      const service = buildService({
        repository: { lockAdjustment: lockAdjustmentMock },
      });

      await expect(service.decide(adjustmentId, approveDto, approverActor)).rejects.toBe(
        assumedCheckError,
      );
    });
  });
});

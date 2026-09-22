import { HttpStatus } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { JobRow, JobsRepository } from '../jobs/jobs.repository';
import { PartRow, PartsRepository } from './parts.repository';
import { PartStatus } from './dto/part.dto';
import {
  PartReservationRow,
  PartReservationsRepository,
  StockBalanceLockRow,
} from './part-reservations.repository';
import { PartReservationsService } from './part-reservations.service';
import { PartReservationStatus } from './dto/part-reservation.dto';
import { StockMovementType } from './dto/stock-balance.dto';
import { StoreRow, StoresRepository } from './stores.repository';
import { StoreStatus } from './dto/store.dto';

const scopeId = '22222222-2222-4222-8222-222222222222';
const jobId = '11111111-1111-4111-8111-111111111111';
const storeId = '33333333-3333-4333-8333-333333333333';
const partId = '44444444-4444-4444-8444-444444444444';
const reservationId = '55555555-5555-4555-8555-555555555555';

const actor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'tech@example.test',
  displayName: 'Technician',
  preferredLocale: 'en',
  roles: ['TECHNICIAN'],
  permissions: ['inventory.read', 'inventory.issue'],
  organizationScopeIds: [scopeId],
  mustChangePassword: false,
};

const sampleJob: JobRow = {
  id: jobId,
  job_number: 'JOB-2026-0001',
  customer_id: 'cust-1',
  customer_display_name: 'John Doe',
  vehicle_id: 'veh-1',
  vehicle_plate: 'ABC-1234',
  organization_scope_id: scopeId,
  complaint: 'Brake pads worn',
  service_type: 'REPAIR',
  priority: 'NORMAL',
  mileage_at_intake: 50000,
  stage: 'IN_PROGRESS',
  stage_changed_at: new Date(),
  bay_id: null,
  technician_id: actor.id,
  scheduled_start_at: null,
  expected_completion_at: new Date(),
  delivered_at: null,
  version: 1,
  created_at: new Date(),
  updated_at: new Date(),
  created_by: actor.id,
  updated_by: actor.id,
  billable_work_allowed: false, // Proves no customer approval is required
  approved_scopes: [],
  pending_approval_count: 1,
};

const sampleStore: StoreRow = {
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

const samplePart: PartRow = {
  id: partId,
  sku: 'BRK-001',
  barcode: '11223344',
  name_en: 'Brake Pad Set',
  name_ar: 'مجموعة بطانات الفرامل',
  category: 'Brakes',
  unit_of_measure: 'SET',
  selling_price_amount: '50.0000',
  selling_price_currency: 'SAR',
  status: PartStatus.ACTIVE,
  version: 1,
  created_at: new Date(),
  updated_at: new Date(),
  created_by: actor.id,
  updated_by: actor.id,
};

const sampleBalance: StockBalanceLockRow = {
  store_id: storeId,
  part_id: partId,
  on_hand: 10,
  reserved: 3,
};

const sampleReservation: PartReservationRow = {
  id: reservationId,
  job_id: jobId,
  part_id: partId,
  store_id: storeId,
  quantity: 5,
  consumed_quantity: 0,
  status: PartReservationStatus.ACTIVE,
  created_at: new Date('2026-03-01T10:00:00.000Z'),
  updated_at: new Date('2026-03-01T10:00:00.000Z'),
  created_by: actor.id,
  updated_by: actor.id,
};

const mockTransactionService = (client: unknown = {}) =>
  ({
    runInTransaction: jest.fn(async (work: (val: never) => unknown) => work(client as never)),
  }) as unknown as TransactionService;

describe('PartReservationsService', () => {
  describe('list', () => {
    it('lists reservations for an accessible job with pagination', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const listByJobIdMock = jest
        .fn()
        .mockResolvedValue({ rows: [sampleReservation], totalItems: 1 });

      const jobsRepository = { findScoped: findJobMock } as unknown as JobsRepository;
      const repository = { listByJobId: listByJobIdMock } as unknown as PartReservationsRepository;

      const service = new PartReservationsService(
        repository,
        jobsRepository,
        {} as StoresRepository,
        {} as PartsRepository,
        {} as TransactionService,
        new ScopeService(),
        {} as AuditService,
      );

      const result = await service.list(jobId, { page: 1, pageSize: 20 }, actor);

      expect(findJobMock).toHaveBeenCalledWith(jobId, [scopeId]);
      expect(listByJobIdMock).toHaveBeenCalledWith(jobId, { page: 1, pageSize: 20 });
      expect(result).toMatchObject({
        items: [
          {
            id: reservationId,
            jobId,
            partId,
            storeId,
            quantity: 5,
            consumedQuantity: 0,
            status: PartReservationStatus.ACTIVE,
          },
        ],
        page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      });
    });

    it('conceals inaccessible job with 404 NOT_FOUND', async () => {
      const findJobMock = jest.fn().mockResolvedValue(null);
      const jobsRepository = { findScoped: findJobMock } as unknown as JobsRepository;

      const service = new PartReservationsService(
        {} as PartReservationsRepository,
        jobsRepository,
        {} as StoresRepository,
        {} as PartsRepository,
        {} as TransactionService,
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.list(jobId, { page: 1, pageSize: 20 }, actor),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('rejects unallowlisted sort field with 400 BAD_REQUEST', async () => {
      const service = new PartReservationsService(
        {} as PartReservationsRepository,
        {} as JobsRepository,
        {} as StoresRepository,
        {} as PartsRepository,
        {} as TransactionService,
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.list(jobId, { page: 1, pageSize: 20, sort: 'quantity' }, actor),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.BAD_REQUEST,
        code: ErrorCode.BAD_REQUEST,
      });
    });
  });

  describe('reserve', () => {
    it('successfully creates reservation in transaction, updates balance reserved, and logs movement', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const lockBalanceMock = jest.fn().mockResolvedValue(sampleBalance); // on_hand: 10, reserved: 3 => available: 7
      const createReservationMock = jest.fn().mockResolvedValue(sampleReservation);
      const updateBalanceMock = jest.fn().mockResolvedValue({
        ...sampleBalance,
        reserved: 7, // 3 + 4
      });
      const createMovementMock = jest.fn().mockResolvedValue(undefined);
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const jobsRepository = { findScoped: findJobMock } as unknown as JobsRepository;
      const storesRepository = { findScoped: findStoreMock } as unknown as StoresRepository;
      const partsRepository = { findById: findPartMock } as unknown as PartsRepository;
      const repository = {
        lockBalance: lockBalanceMock,
        createReservation: createReservationMock,
        updateBalanceReserved: updateBalanceMock,
        createMovement: createMovementMock,
      } as unknown as PartReservationsRepository;
      const audit = { record: auditMock } as unknown as AuditService;

      const service = new PartReservationsService(
        repository,
        jobsRepository,
        storesRepository,
        partsRepository,
        mockTransactionService(),
        new ScopeService(),
        audit,
      );

      const result = await service.reserve(
        jobId,
        { partId, storeId, quantity: 4 },
        actor,
      );

      // Lock ordering: job first, then balance
      expect(findJobMock).toHaveBeenCalledWith(jobId, [scopeId], expect.anything(), true);
      expect(findStoreMock).toHaveBeenCalledWith(storeId, [scopeId], expect.anything(), true);
      expect(findPartMock).toHaveBeenCalledWith(expect.anything(), partId, true);
      expect(lockBalanceMock).toHaveBeenCalledWith(expect.anything(), storeId, partId);

      // Stock reservation execution
      expect(createReservationMock).toHaveBeenCalledWith(expect.anything(), {
        jobId,
        partId,
        storeId,
        quantity: 4,
        actorId: actor.id,
      });
      expect(updateBalanceMock).toHaveBeenCalledWith(expect.anything(), storeId, partId, 4);

      // Immutable movement
      expect(createMovementMock).toHaveBeenCalledWith(expect.anything(), {
        storeId,
        partId,
        type: StockMovementType.RESERVATION,
        onHandDelta: 0,
        reservedDelta: 4,
        onHandAfter: 10,
        reservedAfter: 7,
        jobId,
        actorId: actor.id,
        reason: 'Reserved for job JOB-2026-0001',
      });

      // Audit event
      expect(auditMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'PART_RESERVATION.CREATE',
          entityType: 'PART_RESERVATION',
          entityId: reservationId,
          outcome: 'SUCCESS',
        }),
      );

      expect(result).toMatchObject({
        id: reservationId,
        jobId,
        partId,
        storeId,
        quantity: 5,
        status: PartReservationStatus.ACTIVE,
      });
    });

    it('allows reservation when job stage is RECEIVED', async () => {
      const receivedJob = { ...sampleJob, stage: 'RECEIVED' as const };
      const findJobMock = jest.fn().mockResolvedValue(receivedJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const lockBalanceMock = jest.fn().mockResolvedValue(sampleBalance);
      const createReservationMock = jest.fn().mockResolvedValue(sampleReservation);
      const updateBalanceMock = jest.fn().mockResolvedValue(sampleBalance);
      const createMovementMock = jest.fn().mockResolvedValue(undefined);
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const service = new PartReservationsService(
        {
          lockBalance: lockBalanceMock,
          createReservation: createReservationMock,
          updateBalanceReserved: updateBalanceMock,
          createMovement: createMovementMock,
        } as unknown as PartReservationsRepository,
        { findScoped: findJobMock } as unknown as JobsRepository,
        { findScoped: findStoreMock } as unknown as StoresRepository,
        { findById: findPartMock } as unknown as PartsRepository,
        mockTransactionService(),
        new ScopeService(),
        { record: auditMock } as unknown as AuditService,
      );

      await expect(
        service.reserve(jobId, { partId, storeId, quantity: 2 }, actor),
      ).resolves.toMatchObject({ id: reservationId });
    });

    it.each(['QUALITY_CHECK', 'READY', 'DELIVERED'] as const)(
      'rejects reservation with 409 JOB_STAGE_NOT_ALLOWED when stage is %s',
      async (stage) => {
        const invalidStageJob = { ...sampleJob, stage };
        const findJobMock = jest.fn().mockResolvedValue(invalidStageJob);

        const service = new PartReservationsService(
          {} as PartReservationsRepository,
          { findScoped: findJobMock } as unknown as JobsRepository,
          {} as StoresRepository,
          {} as PartsRepository,
          mockTransactionService(),
          new ScopeService(),
          {} as AuditService,
        );

        await expect(
          service.reserve(jobId, { partId, storeId, quantity: 2 }, actor),
        ).rejects.toMatchObject({
          statusCode: HttpStatus.CONFLICT,
          code: ErrorCode.JOB_STAGE_NOT_ALLOWED,
        });
      },
    );

    it('rejects reservation with 409 INSUFFICIENT_STOCK when quantity exceeds exact available', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      // on_hand: 10, reserved: 8 => available: 2
      const lockBalanceMock = jest.fn().mockResolvedValue({
        store_id: storeId,
        part_id: partId,
        on_hand: 10,
        reserved: 8,
      });

      const service = new PartReservationsService(
        { lockBalance: lockBalanceMock } as unknown as PartReservationsRepository,
        { findScoped: findJobMock } as unknown as JobsRepository,
        { findScoped: findStoreMock } as unknown as StoresRepository,
        { findById: findPartMock } as unknown as PartsRepository,
        mockTransactionService(),
        new ScopeService(),
        {} as AuditService,
      );

      // Requesting 3 when available is 2
      await expect(
        service.reserve(jobId, { partId, storeId, quantity: 3 }, actor),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.INSUFFICIENT_STOCK,
      });
    });

    it('rejects reservation with 409 INSUFFICIENT_STOCK when balance row does not exist', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const lockBalanceMock = jest.fn().mockResolvedValue(null);

      const service = new PartReservationsService(
        { lockBalance: lockBalanceMock } as unknown as PartReservationsRepository,
        { findScoped: findJobMock } as unknown as JobsRepository,
        { findScoped: findStoreMock } as unknown as StoresRepository,
        { findById: findPartMock } as unknown as PartsRepository,
        mockTransactionService(),
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.reserve(jobId, { partId, storeId, quantity: 1 }, actor),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.INSUFFICIENT_STOCK,
      });
    });

    it('conceals inaccessible store with 404 NOT_FOUND', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(null);

      const service = new PartReservationsService(
        {} as PartReservationsRepository,
        { findScoped: findJobMock } as unknown as JobsRepository,
        { findScoped: findStoreMock } as unknown as StoresRepository,
        {} as PartsRepository,
        mockTransactionService(),
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.reserve(jobId, { partId, storeId, quantity: 2 }, actor),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('conceals inactive store with 404 NOT_FOUND', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue({
        ...sampleStore,
        status: StoreStatus.INACTIVE,
      });

      const service = new PartReservationsService(
        {} as PartReservationsRepository,
        { findScoped: findJobMock } as unknown as JobsRepository,
        { findScoped: findStoreMock } as unknown as StoresRepository,
        {} as PartsRepository,
        mockTransactionService(),
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.reserve(jobId, { partId, storeId, quantity: 2 }, actor),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('conceals inactive/archived part with 404 NOT_FOUND', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue({
        ...samplePart,
        status: PartStatus.ARCHIVED,
      });

      const service = new PartReservationsService(
        {} as PartReservationsRepository,
        { findScoped: findJobMock } as unknown as JobsRepository,
        { findScoped: findStoreMock } as unknown as StoresRepository,
        { findById: findPartMock } as unknown as PartsRepository,
        mockTransactionService(),
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.reserve(jobId, { partId, storeId, quantity: 2 }, actor),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('maps database chk_reserved_lte_on_hand constraint violation to 409 INSUFFICIENT_STOCK', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const lockBalanceMock = jest.fn().mockResolvedValue(sampleBalance);
      const createReservationMock = jest.fn().mockRejectedValue({
        code: '23514',
        constraint: 'chk_reserved_lte_on_hand',
      });

      const service = new PartReservationsService(
        {
          lockBalance: lockBalanceMock,
          createReservation: createReservationMock,
        } as unknown as PartReservationsRepository,
        { findScoped: findJobMock } as unknown as JobsRepository,
        { findScoped: findStoreMock } as unknown as StoresRepository,
        { findById: findPartMock } as unknown as PartsRepository,
        mockTransactionService(),
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.reserve(jobId, { partId, storeId, quantity: 2 }, actor),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.INSUFFICIENT_STOCK,
      });
    });

    it('rethrows unexpected database errors untouched', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const unexpectedError = new Error('Database crash');
      const lockBalanceMock = jest.fn().mockRejectedValue(unexpectedError);

      const service = new PartReservationsService(
        { lockBalance: lockBalanceMock } as unknown as PartReservationsRepository,
        { findScoped: findJobMock } as unknown as JobsRepository,
        { findScoped: findStoreMock } as unknown as StoresRepository,
        { findById: findPartMock } as unknown as PartsRepository,
        mockTransactionService(),
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.reserve(jobId, { partId, storeId, quantity: 2 }, actor),
      ).rejects.toThrow(unexpectedError);
    });
  });

  describe('release', () => {
    it('releases remaining quantity, preserves consumed_quantity, decreases balance reserved, and logs movement', async () => {
      const partiallyConsumedReservation: PartReservationRow = {
        ...sampleReservation,
        quantity: 5,
        consumed_quantity: 2, // remaining = 3
        status: PartReservationStatus.ACTIVE,
      };
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const lockReservationMock = jest.fn().mockResolvedValue(partiallyConsumedReservation);
      const lockBalanceMock = jest.fn().mockResolvedValue({
        ...sampleBalance,
        reserved: 5,
      });
      const updateBalanceMock = jest.fn().mockResolvedValue({
        ...sampleBalance,
        reserved: 2, // 5 - 3
      });
      const createMovementMock = jest.fn().mockResolvedValue(undefined);
      const updateStatusMock = jest.fn().mockResolvedValue({
        ...partiallyConsumedReservation,
        status: PartReservationStatus.RELEASED,
        updated_by: actor.id,
      });
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const jobsRepository = { findScoped: findJobMock } as unknown as JobsRepository;
      const repository = {
        lockReservation: lockReservationMock,
        lockBalance: lockBalanceMock,
        updateBalanceReserved: updateBalanceMock,
        createMovement: createMovementMock,
        updateReservationStatus: updateStatusMock,
      } as unknown as PartReservationsRepository;
      const audit = { record: auditMock } as unknown as AuditService;

      const service = new PartReservationsService(
        repository,
        jobsRepository,
        {} as StoresRepository,
        {} as PartsRepository,
        mockTransactionService(),
        new ScopeService(),
        audit,
      );

      const result = await service.release(jobId, reservationId, actor);

      // Lock order: job -> reservation -> balance
      expect(findJobMock).toHaveBeenCalledWith(jobId, [scopeId], expect.anything(), true);
      expect(lockReservationMock).toHaveBeenCalledWith(expect.anything(), reservationId);
      expect(lockBalanceMock).toHaveBeenCalledWith(expect.anything(), storeId, partId);

      // Balance reserved decreased by exact remaining quantity (3)
      expect(updateBalanceMock).toHaveBeenCalledWith(expect.anything(), storeId, partId, -3);

      // Movement created with reservedDelta = -3
      expect(createMovementMock).toHaveBeenCalledWith(expect.anything(), {
        storeId,
        partId,
        type: StockMovementType.RESERVATION_RELEASE,
        onHandDelta: 0,
        reservedDelta: -3,
        onHandAfter: 10,
        reservedAfter: 2,
        jobId,
        actorId: actor.id,
        reason: 'Released reservation for job JOB-2026-0001',
      });

      // Status marked RELEASED
      expect(updateStatusMock).toHaveBeenCalledWith(
        expect.anything(),
        reservationId,
        PartReservationStatus.RELEASED,
        actor.id,
      );

      // Audit record
      expect(auditMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: 'PART_RESERVATION.RELEASE',
          entityType: 'PART_RESERVATION',
          entityId: reservationId,
          outcome: 'SUCCESS',
        }),
      );

      expect(result).toMatchObject({
        id: reservationId,
        quantity: 5,
        consumedQuantity: 2, // Preserved!
        status: PartReservationStatus.RELEASED,
      });
    });

    it('rejects cross-job reservation with 404 NOT_FOUND concealment', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const crossJobReservation: PartReservationRow = {
        ...sampleReservation,
        job_id: 'other-job-id',
      };
      const lockReservationMock = jest.fn().mockResolvedValue(crossJobReservation);

      const service = new PartReservationsService(
        { lockReservation: lockReservationMock } as unknown as PartReservationsRepository,
        { findScoped: findJobMock } as unknown as JobsRepository,
        {} as StoresRepository,
        {} as PartsRepository,
        mockTransactionService(),
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.release(jobId, reservationId, actor),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('rejects already RELEASED reservation with 409 RESERVATION_INVALID', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const releasedReservation: PartReservationRow = {
        ...sampleReservation,
        status: PartReservationStatus.RELEASED,
      };
      const lockReservationMock = jest.fn().mockResolvedValue(releasedReservation);
      const lockBalanceMock = jest.fn().mockResolvedValue(sampleBalance);

      const service = new PartReservationsService(
        {
          lockReservation: lockReservationMock,
          lockBalance: lockBalanceMock,
        } as unknown as PartReservationsRepository,
        { findScoped: findJobMock } as unknown as JobsRepository,
        {} as StoresRepository,
        {} as PartsRepository,
        mockTransactionService(),
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.release(jobId, reservationId, actor),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.RESERVATION_INVALID,
      });
    });

    it('rejects FULFILLED reservation with 409 RESERVATION_INVALID', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const fulfilledReservation: PartReservationRow = {
        ...sampleReservation,
        quantity: 5,
        consumed_quantity: 5,
        status: PartReservationStatus.FULFILLED,
      };
      const lockReservationMock = jest.fn().mockResolvedValue(fulfilledReservation);
      const lockBalanceMock = jest.fn().mockResolvedValue(sampleBalance);

      const service = new PartReservationsService(
        {
          lockReservation: lockReservationMock,
          lockBalance: lockBalanceMock,
        } as unknown as PartReservationsRepository,
        { findScoped: findJobMock } as unknown as JobsRepository,
        {} as StoresRepository,
        {} as PartsRepository,
        mockTransactionService(),
        new ScopeService(),
        {} as AuditService,
      );

      await expect(
        service.release(jobId, reservationId, actor),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.RESERVATION_INVALID,
      });
    });
  });
});

import { HttpStatus } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { JobRow, JobsRepository, WorkItemRow } from '../jobs/jobs.repository';
import { PartIssueStatus } from './dto/part-issue.dto';
import { PartStatus } from './dto/part.dto';
import { PartReservationStatus } from './dto/part-reservation.dto';
import { StoreStatus } from './dto/store.dto';
import { IssueStockBalanceRow, PartIssueReversalRow, PartIssueRow, PartIssuesRepository } from './part-issues.repository';
import { PartIssuesService } from './part-issues.service';
import { PartReservationRow, PartReservationsRepository } from './part-reservations.repository';
import { PartRow, PartsRepository } from './parts.repository';
import { StoreRow, StoresRepository } from './stores.repository';

const scopeId = '22222222-2222-4222-8222-222222222222';
const jobId = '11111111-1111-4111-8111-111111111111';
const storeId = '33333333-3333-4333-8333-333333333333';
const partId = '44444444-4444-4444-8444-444444444444';
const reservationId = '55555555-5555-4555-8555-555555555555';
const workItemId = '66666666-6666-4666-8666-666666666666';
const issueId = '77777777-7777-4777-8777-777777777777';
const movementId = '88888888-8888-4888-8888-888888888888';
const reversalMovementId = '99999999-9999-4999-8999-999999999999';

const actor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'tech@example.test',
  displayName: 'Technician',
  preferredLocale: 'en',
  roles: ['TECHNICIAN'],
  permissions: ['inventory.issue', 'inventory.reverse'],
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
  billable_work_allowed: true,
  approved_scopes: ['INITIAL_WORK'],
  pending_approval_count: 0,
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
  name_ar: null,
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

const sampleBalance: IssueStockBalanceRow = {
  store_id: storeId,
  part_id: partId,
  on_hand: 10,
  reserved: 3,
  average_cost_amount: '30.0000',
  average_cost_currency: 'SAR',
};

const sampleReservation: PartReservationRow = {
  id: reservationId,
  job_id: jobId,
  part_id: partId,
  store_id: storeId,
  quantity: 5,
  consumed_quantity: 2, // remaining = 3
  status: PartReservationStatus.ACTIVE,
  created_at: new Date('2026-03-01T10:00:00.000Z'),
  updated_at: new Date('2026-03-01T10:00:00.000Z'),
  created_by: actor.id,
  updated_by: actor.id,
};

const sampleIssue: PartIssueRow = {
  id: issueId,
  job_id: jobId,
  part_id: partId,
  part_sku: 'BRK-001',
  store_id: storeId,
  work_item_id: null,
  reservation_id: null,
  quantity: 2,
  reversed_quantity: 0,
  unit_price_amount: '50.0000',
  unit_price_currency: 'SAR',
  unit_cost_amount: '30.0000',
  unit_cost_currency: 'SAR',
  line_total_amount: '100.0000',
  line_total_currency: 'SAR',
  status: PartIssueStatus.ISSUED,
  stock_movement_id: movementId,
  idempotency_key: null,
  created_at: new Date('2026-03-01T12:00:00.000Z'),
  updated_at: new Date('2026-03-01T12:00:00.000Z'),
  created_by: actor.id,
  updated_by: actor.id,
};

const mockTransactionService = (client: unknown = {}) =>
  ({
    runInTransaction: jest.fn(async (work: (val: never) => unknown) => work(client as never)),
  }) as unknown as TransactionService;

function buildService(overrides: {
  repository?: Partial<PartIssuesRepository>;
  reservationsRepository?: Partial<PartReservationsRepository>;
  jobsRepository?: Partial<JobsRepository>;
  storesRepository?: Partial<StoresRepository>;
  partsRepository?: Partial<PartsRepository>;
  audit?: Partial<AuditService>;
}): PartIssuesService {
  return new PartIssuesService(
    (overrides.repository ?? {}) as unknown as PartIssuesRepository,
    (overrides.reservationsRepository ?? {}) as unknown as PartReservationsRepository,
    (overrides.jobsRepository ?? {}) as unknown as JobsRepository,
    (overrides.storesRepository ?? {}) as unknown as StoresRepository,
    (overrides.partsRepository ?? {}) as unknown as PartsRepository,
    mockTransactionService(),
    new ScopeService(),
    (overrides.audit ?? {}) as unknown as AuditService,
  );
}

describe('PartIssuesService', () => {
  describe('list', () => {
    it('lists issues for an accessible job with pagination and decimal-string mapping', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const listMock = jest.fn().mockResolvedValue({ rows: [sampleIssue], totalItems: 1 });

      const readerActor: AuthenticatedPrincipal = {
        ...actor,
        roles: ['STOREKEEPER_PROCUREMENT'],
        permissions: ['inventory.read'],
      };
      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        repository: { listByJobId: listMock } as unknown as Partial<PartIssuesRepository>,
      });

      const result = await service.list(jobId, { page: 1, pageSize: 20 }, readerActor);

      expect(findJobMock).toHaveBeenCalledWith(jobId, [scopeId], undefined, false, undefined);
      expect(result).toMatchObject({
        items: [
          {
            id: issueId,
            jobId,
            partId,
            partSku: 'BRK-001',
            storeId,
            quantity: 2,
            reversedQuantity: 0,
            unitPrice: { amount: '50.0000', currency: 'SAR' },
            lineTotal: { amount: '100.0000', currency: 'SAR' },
            status: PartIssueStatus.ISSUED,
            stockMovementId: movementId,
          },
        ],
        page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      });
      // Decimal amounts must remain strings, never numbers
      expect(typeof result.items[0].unitPrice.amount).toBe('string');
      expect(typeof result.items[0].lineTotal.amount).toBe('string');
    });

    it('conceals part issues with 404 NOT_FOUND when technician is not assigned to the job', async () => {
      const findJobMock = jest.fn().mockResolvedValue(null);
      const technicianActor: AuthenticatedPrincipal = {
        ...actor,
        roles: ['TECHNICIAN'],
        permissions: ['inventory.read'],
      };
      const service = buildService({ jobsRepository: { findScoped: findJobMock } });

      await expect(service.list(jobId, { page: 1, pageSize: 20 }, technicianActor)).rejects.toMatchObject({
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
      expect(findJobMock).toHaveBeenCalledWith(jobId, [scopeId], undefined, false, technicianActor.id);
    });

    it('allows assigned TECHNICIAN to list part issues', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const listMock = jest.fn().mockResolvedValue({ rows: [sampleIssue], totalItems: 1 });
      const technicianActor: AuthenticatedPrincipal = {
        ...actor,
        roles: ['TECHNICIAN'],
        permissions: ['inventory.read'],
      };
      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        repository: { listByJobId: listMock } as unknown as Partial<PartIssuesRepository>,
      });

      const result = await service.list(jobId, { page: 1, pageSize: 20 }, technicianActor);

      expect(findJobMock).toHaveBeenCalledWith(jobId, [scopeId], undefined, false, technicianActor.id);
      expect(result.items).toHaveLength(1);
    });

    it('allows scoped non-technician with inventory.read but without jobs.read to list part issues', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const listMock = jest.fn().mockResolvedValue({ rows: [sampleIssue], totalItems: 1 });
      const nonTechnicianActor: AuthenticatedPrincipal = {
        ...actor,
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        roles: ['STOREKEEPER_PROCUREMENT'],
        permissions: ['inventory.read'],
      };
      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        repository: { listByJobId: listMock } as unknown as Partial<PartIssuesRepository>,
      });

      const result = await service.list(jobId, { page: 1, pageSize: 20 }, nonTechnicianActor);

      expect(findJobMock).toHaveBeenCalledWith(jobId, [scopeId], undefined, false, undefined);
      expect(result.items).toHaveLength(1);
    });

    it('conceals inaccessible/cross-job or out-of-scope job with 404 NOT_FOUND', async () => {
      const findJobMock = jest.fn().mockResolvedValue(null);
      const service = buildService({ jobsRepository: { findScoped: findJobMock } });

      await expect(service.list(jobId, { page: 1, pageSize: 20 }, actor)).rejects.toMatchObject({
        statusCode: HttpStatus.NOT_FOUND,
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('sorts by createdAt ascending and descending', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const listMock = jest.fn().mockResolvedValue({ rows: [sampleIssue], totalItems: 1 });
      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        repository: { listByJobId: listMock } as unknown as Partial<PartIssuesRepository>,
      });

      await service.list(jobId, { page: 1, pageSize: 20, sort: '-createdAt' }, actor);
      expect(listMock).toHaveBeenCalledWith(jobId, { page: 1, pageSize: 20, sort: '-createdAt' });
    });

    it('rejects an unknown sort field with 400 BAD_REQUEST', async () => {
      const service = buildService({});

      await expect(
        service.list(jobId, { page: 1, pageSize: 20, sort: 'quantity' }, actor),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.BAD_REQUEST,
        code: ErrorCode.BAD_REQUEST,
      });
    });

    it('includes unitCost only with inventory.cost.read', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const listMock = jest.fn().mockResolvedValue({ rows: [sampleIssue], totalItems: 1 });

      const withCost = buildService({
        jobsRepository: { findScoped: findJobMock },
        repository: { listByJobId: listMock } as unknown as Partial<PartIssuesRepository>,
      });
      const resultWithCost = await withCost.list(
        jobId,
        { page: 1, pageSize: 20 },
        { ...actor, permissions: ['inventory.issue', 'inventory.cost.read'] },
      );
      expect(resultWithCost.items[0]).toMatchObject({ unitCost: { amount: '30.0000', currency: 'SAR' } });

      const withoutCost = buildService({
        jobsRepository: { findScoped: findJobMock },
        repository: { listByJobId: listMock } as unknown as Partial<PartIssuesRepository>,
      });
      const resultWithoutCost = await withoutCost.list(jobId, { page: 1, pageSize: 20 }, actor);
      expect(resultWithoutCost.items[0]).not.toHaveProperty('unitCost');
    });
  });

  describe('issue', () => {
    function buildIssueRepository(overrides: Partial<PartIssuesRepository> = {}) {
      return {
        acquireIdempotencyLock: jest.fn().mockResolvedValue(undefined),
        findByIdempotencyKey: jest.fn().mockResolvedValue(null),
        hasApprovedAdditionalWorkApproval: jest.fn().mockResolvedValue(true),
        lockBalanceForIssue: jest.fn().mockResolvedValue(sampleBalance),
        updateBalanceForIssue: jest.fn().mockResolvedValue({ on_hand: 8, reserved: 2 }),
        computeLineTotal: jest.fn().mockResolvedValue('100.0000'),
        createIssueMovement: jest.fn().mockResolvedValue(movementId),
        createPartIssue: jest.fn().mockResolvedValue(sampleIssue),
        ...overrides,
      } as unknown as PartIssuesRepository;
    }

    it('requires the caller to be assigned to the job (findScoped locked with actor.id)', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        storesRepository: { findScoped: findStoreMock },
        partsRepository: { findById: findPartMock },
        repository: buildIssueRepository(),
        audit: { record: auditMock },
      });

      await service.issue(jobId, { partId, storeId, quantity: 2 }, actor, undefined);

      expect(findJobMock).toHaveBeenCalledWith(jobId, [scopeId], expect.anything(), true, actor.id);
    });

    it('always requires assignment for issue creation, even for scoped non-technicians', async () => {
      const findJobMock = jest.fn().mockResolvedValue(null);
      const nonTechnicianActor: AuthenticatedPrincipal = {
        ...actor,
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        roles: ['STOREKEEPER_PROCUREMENT'],
        permissions: ['inventory.issue'],
      };

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        storesRepository: { findScoped: jest.fn().mockResolvedValue(sampleStore) },
        partsRepository: { findById: jest.fn().mockResolvedValue(samplePart) },
        repository: buildIssueRepository(),
      });

      await expect(
        service.issue(jobId, { partId, storeId, quantity: 2 }, nonTechnicianActor, undefined),
      ).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND, code: ErrorCode.NOT_FOUND });

      expect(findJobMock).toHaveBeenCalledWith(jobId, [scopeId], expect.anything(), true, nonTechnicianActor.id);
    });

    it('rejects a job that is not IN_PROGRESS with 409 JOB_STAGE_NOT_ALLOWED', async () => {
      const stagedJob = { ...sampleJob, stage: 'RECEIVED' as const };
      const findJobMock = jest.fn().mockResolvedValue(stagedJob);
      const service = buildService({ jobsRepository: { findScoped: findJobMock } });

      await expect(
        service.issue(jobId, { partId, storeId, quantity: 2 }, actor, undefined),
      ).rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT, code: ErrorCode.JOB_STAGE_NOT_ALLOWED });
    });

    it('requires an APPROVED INITIAL_WORK approval with 409 CUSTOMER_APPROVAL_REQUIRED', async () => {
      const unapprovedJob = { ...sampleJob, billable_work_allowed: false };
      const findJobMock = jest.fn().mockResolvedValue(unapprovedJob);
      const service = buildService({ jobsRepository: { findScoped: findJobMock } });

      await expect(
        service.issue(jobId, { partId, storeId, quantity: 2 }, actor, undefined),
      ).rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT, code: ErrorCode.CUSTOMER_APPROVAL_REQUIRED });
    });

    it('rejects a workItemId that does not belong to the URL job with 404', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findWorkItemMock = jest.fn().mockResolvedValue(null);
      const service = buildService({
        jobsRepository: { findScoped: findJobMock, findWorkItem: findWorkItemMock },
      });

      await expect(
        service.issue(jobId, { partId, storeId, quantity: 2, workItemId }, actor, undefined),
      ).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND, code: ErrorCode.NOT_FOUND });
    });

    it('requires an APPROVED ADDITIONAL_WORK approval for additional-work items', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const additionalWorkItem: WorkItemRow = {
        id: workItemId,
        job_id: jobId,
        description: 'Extra repair',
        status: 'PENDING',
        is_additional_work: true,
        approval_id: 'approval-1',
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: actor.id,
        updated_by: actor.id,
      };
      const findWorkItemMock = jest.fn().mockResolvedValue(additionalWorkItem);
      const hasApprovalMock = jest.fn().mockResolvedValue(false);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock, findWorkItem: findWorkItemMock },
        repository: buildIssueRepository({ hasApprovedAdditionalWorkApproval: hasApprovalMock }),
      });

      await expect(
        service.issue(jobId, { partId, storeId, quantity: 2, workItemId }, actor, undefined),
      ).rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT, code: ErrorCode.CUSTOMER_APPROVAL_REQUIRED });
      expect(hasApprovalMock).toHaveBeenCalledWith(expect.anything(), workItemId);
    });

    it('issues normally for a non-additional-work item without checking approvals', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const normalWorkItem: WorkItemRow = {
        id: workItemId,
        job_id: jobId,
        description: 'Standard repair',
        status: 'PENDING',
        is_additional_work: false,
        approval_id: null,
        completed_at: null,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: actor.id,
        updated_by: actor.id,
      };
      const findWorkItemMock = jest.fn().mockResolvedValue(normalWorkItem);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const hasApprovalMock = jest.fn().mockResolvedValue(false);
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock, findWorkItem: findWorkItemMock },
        storesRepository: { findScoped: findStoreMock },
        partsRepository: { findById: findPartMock },
        repository: buildIssueRepository({ hasApprovedAdditionalWorkApproval: hasApprovalMock }),
        audit: { record: auditMock },
      });

      await expect(
        service.issue(jobId, { partId, storeId, quantity: 2, workItemId }, actor, undefined),
      ).resolves.toMatchObject({ id: issueId });
      expect(hasApprovalMock).not.toHaveBeenCalled();
    });

    it('conceals inactive/archived part with 404 NOT_FOUND', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findPartMock = jest.fn().mockResolvedValue({ ...samplePart, status: PartStatus.ARCHIVED });
      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        partsRepository: { findById: findPartMock },
      });

      await expect(
        service.issue(jobId, { partId, storeId, quantity: 2 }, actor, undefined),
      ).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND, code: ErrorCode.NOT_FOUND });
    });

    it('conceals inactive or out-of-scope store with 404 NOT_FOUND', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const findStoreMock = jest.fn().mockResolvedValue(null);
      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        partsRepository: { findById: findPartMock },
        storesRepository: { findScoped: findStoreMock },
      });

      await expect(
        service.issue(jobId, { partId, storeId, quantity: 2 }, actor, undefined),
      ).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND, code: ErrorCode.NOT_FOUND });
    });

    it('computes exact available stock without a reservation (on_hand - reserved)', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const lockBalanceMock = jest.fn().mockResolvedValue(sampleBalance); // on_hand 10, reserved 3 => usable 7
      const updateBalanceMock = jest.fn().mockResolvedValue({ on_hand: 3, reserved: 3 });
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        storesRepository: { findScoped: findStoreMock },
        partsRepository: { findById: findPartMock },
        repository: buildIssueRepository({ lockBalanceForIssue: lockBalanceMock, updateBalanceForIssue: updateBalanceMock }),
        audit: { record: auditMock },
      });

      await expect(
        service.issue(jobId, { partId, storeId, quantity: 7 }, actor, undefined),
      ).resolves.toMatchObject({ id: issueId });

      await expect(
        service.issue(jobId, { partId, storeId, quantity: 8 }, actor, undefined),
      ).rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT, code: ErrorCode.INSUFFICIENT_STOCK });
    });

    it('computes exact available stock with a reservation (on_hand - reserved + remaining reservation)', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const lockReservationMock = jest.fn().mockResolvedValue(sampleReservation); // remaining = 3
      const lockBalanceMock = jest.fn().mockResolvedValue(sampleBalance); // on_hand 10, reserved 3 => usable 7+3=10
      const updateBalanceMock = jest.fn().mockResolvedValue({ on_hand: 0, reserved: 0 });
      const consumeMock = jest.fn().mockResolvedValue({ ...sampleReservation, consumed_quantity: 5 });
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        storesRepository: { findScoped: findStoreMock },
        partsRepository: { findById: findPartMock },
        reservationsRepository: { lockReservation: lockReservationMock, consumeReservation: consumeMock },
        repository: buildIssueRepository({ lockBalanceForIssue: lockBalanceMock, updateBalanceForIssue: updateBalanceMock }),
        audit: { record: auditMock },
      });

      await expect(
        service.issue(jobId, { partId, storeId, quantity: 10, reservationId }, actor, undefined),
      ).resolves.toMatchObject({ id: issueId });

      await expect(
        service.issue(jobId, { partId, storeId, quantity: 11, reservationId }, actor, undefined),
      ).rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT, code: ErrorCode.INSUFFICIENT_STOCK });
    });

    it('partially consumes a reservation without marking it FULFILLED', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const lockReservationMock = jest.fn().mockResolvedValue(sampleReservation); // remaining = 3
      const lockBalanceMock = jest.fn().mockResolvedValue(sampleBalance);
      const updateBalanceMock = jest.fn().mockResolvedValue({ on_hand: 8, reserved: 1 });
      const consumeMock = jest.fn().mockResolvedValue({ ...sampleReservation, consumed_quantity: 4 });
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        storesRepository: { findScoped: findStoreMock },
        partsRepository: { findById: findPartMock },
        reservationsRepository: { lockReservation: lockReservationMock, consumeReservation: consumeMock },
        repository: buildIssueRepository({ lockBalanceForIssue: lockBalanceMock, updateBalanceForIssue: updateBalanceMock }),
        audit: { record: auditMock },
      });

      // Requesting 2, remaining reservation is 3 => consumed = min(2,3) = 2
      await service.issue(jobId, { partId, storeId, quantity: 2, reservationId }, actor, undefined);

      expect(consumeMock).toHaveBeenCalledWith(expect.anything(), reservationId, 2, actor.id);
      expect(updateBalanceMock).toHaveBeenCalledWith(expect.anything(), storeId, partId, -2, -2);
    });

    it('fully consumes a reservation, capping consumption at the remaining amount', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const lockReservationMock = jest.fn().mockResolvedValue(sampleReservation); // remaining = 3
      const lockBalanceMock = jest.fn().mockResolvedValue(sampleBalance);
      const updateBalanceMock = jest.fn().mockResolvedValue({ on_hand: 5, reserved: 0 });
      const consumeMock = jest.fn().mockResolvedValue({ ...sampleReservation, consumed_quantity: 5, status: PartReservationStatus.FULFILLED });
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        storesRepository: { findScoped: findStoreMock },
        partsRepository: { findById: findPartMock },
        reservationsRepository: { lockReservation: lockReservationMock, consumeReservation: consumeMock },
        repository: buildIssueRepository({ lockBalanceForIssue: lockBalanceMock, updateBalanceForIssue: updateBalanceMock }),
        audit: { record: auditMock },
      });

      // Requesting 5 but remaining reservation is only 3 => consumed = min(5,3) = 3, on_hand still drops by full 5
      await service.issue(jobId, { partId, storeId, quantity: 5, reservationId }, actor, undefined);

      expect(consumeMock).toHaveBeenCalledWith(expect.anything(), reservationId, 3, actor.id);
      expect(updateBalanceMock).toHaveBeenCalledWith(expect.anything(), storeId, partId, -5, -3);
    });

    it('rejects a reservation belonging to a different job/part/store with 404', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const lockReservationMock = jest.fn().mockResolvedValue({ ...sampleReservation, job_id: 'other-job' });

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        storesRepository: { findScoped: findStoreMock },
        partsRepository: { findById: findPartMock },
        reservationsRepository: { lockReservation: lockReservationMock },
      });

      await expect(
        service.issue(jobId, { partId, storeId, quantity: 2, reservationId }, actor, undefined),
      ).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND, code: ErrorCode.NOT_FOUND });
    });

    it('rejects a non-ACTIVE reservation with 409 RESERVATION_INVALID', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const lockReservationMock = jest.fn().mockResolvedValue({ ...sampleReservation, status: PartReservationStatus.RELEASED });

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        storesRepository: { findScoped: findStoreMock },
        partsRepository: { findById: findPartMock },
        reservationsRepository: { lockReservation: lockReservationMock },
      });

      await expect(
        service.issue(jobId, { partId, storeId, quantity: 2, reservationId }, actor, undefined),
      ).rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT, code: ErrorCode.RESERVATION_INVALID });
    });

    it('locks the reservation before the stock balance', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const lockReservationMock = jest.fn().mockResolvedValue(sampleReservation);
      const lockBalanceMock = jest.fn().mockResolvedValue(sampleBalance);
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        storesRepository: { findScoped: findStoreMock },
        partsRepository: { findById: findPartMock },
        reservationsRepository: { lockReservation: lockReservationMock, consumeReservation: jest.fn().mockResolvedValue(sampleReservation) },
        repository: buildIssueRepository({ lockBalanceForIssue: lockBalanceMock }),
        audit: { record: auditMock },
      });

      await service.issue(jobId, { partId, storeId, quantity: 2, reservationId }, actor, undefined);

      const reservationOrder = lockReservationMock.mock.invocationCallOrder[0];
      const balanceOrder = lockBalanceMock.mock.invocationCallOrder[0];
      expect(reservationOrder).toBeLessThan(balanceOrder);
    });

    it('rejects a shortfall with 409 INSUFFICIENT_STOCK and structured available/requested details', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const lockBalanceMock = jest.fn().mockResolvedValue(sampleBalance); // usable = 7

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        storesRepository: { findScoped: findStoreMock },
        partsRepository: { findById: findPartMock },
        repository: buildIssueRepository({ lockBalanceForIssue: lockBalanceMock }),
      });

      await expect(
        service.issue(jobId, { partId, storeId, quantity: 8 }, actor, undefined),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        code: ErrorCode.INSUFFICIENT_STOCK,
        details: [
          expect.objectContaining({
            field: '/quantity',
            params: { available: '7', requested: '8' },
          }),
        ],
      });
    });

    it('inserts the ISSUE movement with exact deltas and after-values before the part issue', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const lockBalanceMock = jest.fn().mockResolvedValue(sampleBalance); // on_hand 10, reserved 3
      const updateBalanceMock = jest.fn().mockResolvedValue({ on_hand: 8, reserved: 3 });
      const createMovementMock = jest.fn().mockResolvedValue(movementId);
      const createIssueMock = jest.fn().mockResolvedValue(sampleIssue);
      const computeLineTotalMock = jest.fn().mockResolvedValue('100.0000');
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        storesRepository: { findScoped: findStoreMock },
        partsRepository: { findById: findPartMock },
        repository: buildIssueRepository({
          lockBalanceForIssue: lockBalanceMock,
          updateBalanceForIssue: updateBalanceMock,
          createIssueMovement: createMovementMock,
          createPartIssue: createIssueMock,
          computeLineTotal: computeLineTotalMock,
        }),
        audit: { record: auditMock },
      });

      await service.issue(jobId, { partId, storeId, quantity: 2 }, actor, undefined);

      expect(updateBalanceMock).toHaveBeenCalledWith(expect.anything(), storeId, partId, -2, 0);
      expect(createMovementMock).toHaveBeenCalledWith(expect.anything(), {
        storeId,
        partId,
        onHandDelta: -2,
        reservedDelta: 0,
        onHandAfter: 8,
        reservedAfter: 3,
        unitCostAmount: '30.0000',
        unitCostCurrency: 'SAR',
        jobId,
        actorId: actor.id,
        reason: 'Issued to job JOB-2026-0001',
      });

      // Movement inserted before the PartIssue, so its id can be embedded as stock_movement_id
      const movementOrder = createMovementMock.mock.invocationCallOrder[0];
      const issueOrder = createIssueMock.mock.invocationCallOrder[0];
      expect(movementOrder).toBeLessThan(issueOrder);
      expect(createIssueMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ stockMovementId: movementId }),
      );

      // Line total computed via PostgreSQL NUMERIC arithmetic, not JS floating point
      expect(computeLineTotalMock).toHaveBeenCalledWith(expect.anything(), '50.0000', 2);
      expect(createIssueMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ lineTotalAmount: '100.0000', lineTotalCurrency: 'SAR' }),
      );

      expect(auditMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'PART_ISSUE.CREATE', entityType: 'PART_ISSUE', outcome: 'SUCCESS' }),
      );
    });

    it('omits the unit cost snapshot when the balance has no average cost currency yet', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const noCostBalance: IssueStockBalanceRow = {
        ...sampleBalance,
        average_cost_amount: '0.0000',
        average_cost_currency: null,
      };
      const lockBalanceMock = jest.fn().mockResolvedValue(noCostBalance);
      const createMovementMock = jest.fn().mockResolvedValue(movementId);
      const createIssueMock = jest.fn().mockResolvedValue(sampleIssue);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        storesRepository: { findScoped: findStoreMock },
        partsRepository: { findById: findPartMock },
        repository: buildIssueRepository({
          lockBalanceForIssue: lockBalanceMock,
          createIssueMovement: createMovementMock,
          createPartIssue: createIssueMock,
        }),
        audit: { record: jest.fn().mockResolvedValue(undefined) },
      });

      await service.issue(jobId, { partId, storeId, quantity: 2 }, actor, undefined);

      expect(createMovementMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ unitCostAmount: null, unitCostCurrency: null }),
      );
      expect(createIssueMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ unitCostAmount: null, unitCostCurrency: null }),
      );
    });

    it('gates unitCost in the response by inventory.cost.read', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        storesRepository: { findScoped: findStoreMock },
        partsRepository: { findById: findPartMock },
        repository: buildIssueRepository(),
        audit: { record: jest.fn().mockResolvedValue(undefined) },
      });

      const withCost = await service.issue(
        jobId,
        { partId, storeId, quantity: 2 },
        { ...actor, permissions: ['inventory.issue', 'inventory.cost.read'] },
        undefined,
      );
      expect(withCost).toMatchObject({ unitCost: { amount: '30.0000', currency: 'SAR' } });

      const withoutCost = await service.issue(jobId, { partId, storeId, quantity: 2 }, actor, undefined);
      expect(withoutCost).not.toHaveProperty('unitCost');
    });

    it('maps a chk_reserved_lte_on_hand race to 409 INSUFFICIENT_STOCK', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const lockBalanceMock = jest.fn().mockResolvedValue(sampleBalance);
      const updateBalanceMock = jest.fn().mockRejectedValue({ code: '23514', constraint: 'chk_reserved_lte_on_hand' });

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        storesRepository: { findScoped: findStoreMock },
        partsRepository: { findById: findPartMock },
        repository: buildIssueRepository({ lockBalanceForIssue: lockBalanceMock, updateBalanceForIssue: updateBalanceMock }),
      });

      await expect(
        service.issue(jobId, { partId, storeId, quantity: 2 }, actor, undefined),
      ).rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT, code: ErrorCode.INSUFFICIENT_STOCK });
    });

    it('rethrows unexpected database errors untouched, leaving no partial state', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
      const findPartMock = jest.fn().mockResolvedValue(samplePart);
      const unexpectedError = new Error('Database crash');
      const lockBalanceMock = jest.fn().mockRejectedValue(unexpectedError);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        storesRepository: { findScoped: findStoreMock },
        partsRepository: { findById: findPartMock },
        repository: buildIssueRepository({ lockBalanceForIssue: lockBalanceMock }),
      });

      await expect(
        service.issue(jobId, { partId, storeId, quantity: 2 }, actor, undefined),
      ).rejects.toThrow(unexpectedError);
    });

    describe('idempotency', () => {
      it('processes the first request normally when no prior row exists for the key', async () => {
        const findJobMock = jest.fn().mockResolvedValue(sampleJob);
        const findStoreMock = jest.fn().mockResolvedValue(sampleStore);
        const findPartMock = jest.fn().mockResolvedValue(samplePart);
        const acquireLockMock = jest.fn().mockResolvedValue(undefined);
        const findByKeyMock = jest.fn().mockResolvedValue(null);
        const createIssueMock = jest.fn().mockResolvedValue(sampleIssue);
        const auditMock = jest.fn().mockResolvedValue(undefined);

        const service = buildService({
          jobsRepository: { findScoped: findJobMock },
          storesRepository: { findScoped: findStoreMock },
          partsRepository: { findById: findPartMock },
          repository: buildIssueRepository({
            acquireIdempotencyLock: acquireLockMock,
            findByIdempotencyKey: findByKeyMock,
            createPartIssue: createIssueMock,
          }),
          audit: { record: auditMock },
        });

        await service.issue(jobId, { partId, storeId, quantity: 2 }, actor, 'a-valid-key-123');

        expect(acquireLockMock).toHaveBeenCalledWith(expect.anything(), 'part_issue', 'a-valid-key-123');
        expect(findByKeyMock).toHaveBeenCalledWith(expect.anything(), 'a-valid-key-123');
        expect(createIssueMock).toHaveBeenCalled();
        expect(auditMock).toHaveBeenCalled();

        // Lock acquired before the lookup, serializing concurrent same-key requests
        const lockOrder = acquireLockMock.mock.invocationCallOrder[0];
        const findOrder = findByKeyMock.mock.invocationCallOrder[0];
        expect(lockOrder).toBeLessThan(findOrder);
      });

      it('replays an identical same-caller, same-key request without re-mutating stock', async () => {
        const findJobMock = jest.fn().mockResolvedValue(sampleJob);
        const findByKeyMock = jest.fn().mockResolvedValue({ ...sampleIssue, created_by: actor.id, part_id: partId, store_id: storeId, quantity: 2, work_item_id: null, reservation_id: null });
        const createIssueMock = jest.fn();
        const createMovementMock = jest.fn();
        const updateBalanceMock = jest.fn();
        const auditMock = jest.fn();
        const lockBalanceMock = jest.fn();

        const service = buildService({
          jobsRepository: { findScoped: findJobMock },
          repository: buildIssueRepository({
            findByIdempotencyKey: findByKeyMock,
            createPartIssue: createIssueMock,
            createIssueMovement: createMovementMock,
            updateBalanceForIssue: updateBalanceMock,
            lockBalanceForIssue: lockBalanceMock,
          }),
          audit: { record: auditMock },
        });

        const result = await service.issue(jobId, { partId, storeId, quantity: 2 }, actor, 'a-valid-key-123');

        expect(result).toMatchObject({ id: issueId });
        // No duplicate balance change, reservation consumption, ledger row, or audit event
        expect(createIssueMock).not.toHaveBeenCalled();
        expect(createMovementMock).not.toHaveBeenCalled();
        expect(updateBalanceMock).not.toHaveBeenCalled();
        expect(lockBalanceMock).not.toHaveBeenCalled();
        expect(auditMock).not.toHaveBeenCalled();
      });

      it('rejects a same-key request with different semantic fields with 409 IDEMPOTENCY_CONFLICT', async () => {
        const findJobMock = jest.fn().mockResolvedValue(sampleJob);
        const findByKeyMock = jest.fn().mockResolvedValue({
          ...sampleIssue,
          created_by: actor.id,
          part_id: partId,
          store_id: storeId,
          quantity: 5, // different from the requested quantity below
        });

        const service = buildService({
          jobsRepository: { findScoped: findJobMock },
          repository: buildIssueRepository({ findByIdempotencyKey: findByKeyMock }),
        });

        await expect(
          service.issue(jobId, { partId, storeId, quantity: 2 }, actor, 'a-valid-key-123'),
        ).rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT, code: ErrorCode.IDEMPOTENCY_CONFLICT });
      });

      it('rejects a same-key request from a different caller with 409 IDEMPOTENCY_CONFLICT', async () => {
        const findJobMock = jest.fn().mockResolvedValue(sampleJob);
        const findByKeyMock = jest.fn().mockResolvedValue({
          ...sampleIssue,
          created_by: 'someone-else',
          part_id: partId,
          store_id: storeId,
          quantity: 2,
        });

        const service = buildService({
          jobsRepository: { findScoped: findJobMock },
          repository: buildIssueRepository({ findByIdempotencyKey: findByKeyMock }),
        });

        await expect(
          service.issue(jobId, { partId, storeId, quantity: 2 }, actor, 'a-valid-key-123'),
        ).rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT, code: ErrorCode.IDEMPOTENCY_CONFLICT });
      });

      it('conceals a replay for an inaccessible job with 404 NOT_FOUND', async () => {
        const findJobMock = jest.fn().mockResolvedValue(null);
        const findByKeyMock = jest.fn().mockResolvedValue({ ...sampleIssue, created_by: actor.id });

        const service = buildService({
          jobsRepository: { findScoped: findJobMock },
          repository: buildIssueRepository({ findByIdempotencyKey: findByKeyMock }),
        });

        await expect(
          service.issue(jobId, { partId, storeId, quantity: 2 }, actor, 'a-valid-key-123'),
        ).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND, code: ErrorCode.NOT_FOUND });
      });
    });
  });

  describe('reverse', () => {
    function buildIssueRepository(overrides: Partial<PartIssuesRepository> = {}) {
      return {
        acquireIdempotencyLock: jest.fn().mockResolvedValue(undefined),
        findReversalByIdempotencyKey: jest.fn().mockResolvedValue(null),
        lockIssue: jest.fn().mockResolvedValue(sampleIssue),
        lockBalanceForIssue: jest.fn().mockResolvedValue(sampleBalance),
        updateBalanceForIssue: jest.fn().mockResolvedValue({ on_hand: 11, reserved: 3 }),
        createReversalMovement: jest.fn().mockResolvedValue(reversalMovementId),
        createReversal: jest.fn().mockResolvedValue({
          id: 'reversal-1',
          part_issue_id: issueId,
          quantity: 1,
          reason: 'Wrong part installed',
          reversed_by: actor.id,
          reversed_at: new Date(),
          stock_movement_id: reversalMovementId,
          idempotency_key: null,
        } satisfies PartIssueReversalRow),
        applyReversal: jest.fn().mockResolvedValue({ ...sampleIssue, reversed_quantity: 1, status: PartIssueStatus.PARTIALLY_REVERSED }),
        ...overrides,
      } as unknown as PartIssuesRepository;
    }

    it.each(['IN_PROGRESS', 'QUALITY_CHECK'] as const)('allows reversal while the job is %s', async (stage) => {
      const findJobMock = jest.fn().mockResolvedValue({ ...sampleJob, stage });
      const auditMock = jest.fn().mockResolvedValue(undefined);
      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        repository: buildIssueRepository(),
        audit: { record: auditMock },
      });

      await expect(
        service.reverse(jobId, issueId, { quantity: 1, reason: 'Wrong part installed' }, actor, undefined),
      ).resolves.toMatchObject({ id: 'reversal-1' });
    });

    it('conceals reversal with 404 NOT_FOUND when technician is not assigned to the job', async () => {
      const findJobMock = jest.fn().mockResolvedValue(null);
      const createReversalMock = jest.fn();
      const createMovementMock = jest.fn();
      const updateBalanceMock = jest.fn();
      const technicianActor: AuthenticatedPrincipal = {
        ...actor,
        roles: ['TECHNICIAN'],
        permissions: ['inventory.reverse'],
      };

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        repository: buildIssueRepository({
          createReversal: createReversalMock,
          createReversalMovement: createMovementMock,
          updateBalanceForIssue: updateBalanceMock,
        }),
      });

      await expect(
        service.reverse(jobId, issueId, { quantity: 1, reason: 'Wrong part installed' }, technicianActor, undefined),
      ).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND, code: ErrorCode.NOT_FOUND });

      expect(findJobMock).toHaveBeenCalledWith(jobId, [scopeId], expect.anything(), true, technicianActor.id);
      expect(createReversalMock).not.toHaveBeenCalled();
      expect(createMovementMock).not.toHaveBeenCalled();
      expect(updateBalanceMock).not.toHaveBeenCalled();
    });

    it('allows scoped non-technician with inventory.reverse but without jobs.read to reverse an issue', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const nonTechnicianActor: AuthenticatedPrincipal = {
        ...actor,
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        roles: ['STOREKEEPER_PROCUREMENT'],
        permissions: ['inventory.reverse'],
      };
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        repository: buildIssueRepository(),
        audit: { record: auditMock },
      });

      await expect(
        service.reverse(jobId, issueId, { quantity: 1, reason: 'Wrong part installed' }, nonTechnicianActor, undefined),
      ).resolves.toMatchObject({ id: 'reversal-1' });

      expect(findJobMock).toHaveBeenCalledWith(jobId, [scopeId], expect.anything(), true, undefined);
    });

    it.each(['RECEIVED', 'READY', 'DELIVERED'] as const)(
      'rejects reversal with 409 JOB_STAGE_NOT_ALLOWED when stage is %s',
      async (stage) => {
        const findJobMock = jest.fn().mockResolvedValue({ ...sampleJob, stage });
        const service = buildService({ jobsRepository: { findScoped: findJobMock } });

        await expect(
          service.reverse(jobId, issueId, { quantity: 1, reason: 'Wrong part installed' }, actor, undefined),
        ).rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT, code: ErrorCode.JOB_STAGE_NOT_ALLOWED });
      },
    );

    it('conceals a cross-job part issue with 404 NOT_FOUND', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const lockIssueMock = jest.fn().mockResolvedValue({ ...sampleIssue, job_id: 'other-job' });

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        repository: buildIssueRepository({ lockIssue: lockIssueMock }),
      });

      await expect(
        service.reverse(jobId, issueId, { quantity: 1, reason: 'Wrong part installed' }, actor, undefined),
      ).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND, code: ErrorCode.NOT_FOUND });
    });

    it('computes the exact remaining reversible quantity (quantity - reversed_quantity)', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const partiallyReversedIssue = { ...sampleIssue, quantity: 5, reversed_quantity: 2 }; // remaining = 3
      const lockIssueMock = jest.fn().mockResolvedValue(partiallyReversedIssue);
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        repository: buildIssueRepository({ lockIssue: lockIssueMock }),
        audit: { record: auditMock },
      });

      await expect(
        service.reverse(jobId, issueId, { quantity: 3, reason: 'Wrong part installed' }, actor, undefined),
      ).resolves.toMatchObject({ id: 'reversal-1' });
    });

    it('rejects a reversal exceeding the remaining issued quantity with 409 REVERSAL_EXCEEDS_ISSUED', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const partiallyReversedIssue = { ...sampleIssue, quantity: 5, reversed_quantity: 2 }; // remaining = 3
      const lockIssueMock = jest.fn().mockResolvedValue(partiallyReversedIssue);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        repository: buildIssueRepository({ lockIssue: lockIssueMock }),
      });

      await expect(
        service.reverse(jobId, issueId, { quantity: 4, reason: 'Wrong part installed' }, actor, undefined),
      ).rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT, code: ErrorCode.REVERSAL_EXCEEDS_ISSUED });
    });

    it('marks status PARTIALLY_REVERSED between 0 and the full quantity', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const issueRow = { ...sampleIssue, quantity: 5, reversed_quantity: 0 };
      const lockIssueMock = jest.fn().mockResolvedValue(issueRow);
      const applyReversalMock = jest.fn().mockResolvedValue({ ...issueRow, reversed_quantity: 2, status: PartIssueStatus.PARTIALLY_REVERSED });
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        repository: buildIssueRepository({ lockIssue: lockIssueMock, applyReversal: applyReversalMock }),
        audit: { record: auditMock },
      });

      const result = await service.reverse(jobId, issueId, { quantity: 2, reason: 'Wrong part installed' }, actor, undefined);

      expect(applyReversalMock).toHaveBeenCalledWith(expect.anything(), issueId, 2, PartIssueStatus.PARTIALLY_REVERSED, actor.id);
      expect(result.partIssueStatus).toBe(PartIssueStatus.PARTIALLY_REVERSED);
    });

    it('marks status REVERSED when reversed_quantity reaches the full quantity', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const issueRow = { ...sampleIssue, quantity: 5, reversed_quantity: 0 };
      const lockIssueMock = jest.fn().mockResolvedValue(issueRow);
      const applyReversalMock = jest.fn().mockResolvedValue({ ...issueRow, reversed_quantity: 5, status: PartIssueStatus.REVERSED });
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        repository: buildIssueRepository({ lockIssue: lockIssueMock, applyReversal: applyReversalMock }),
        audit: { record: auditMock },
      });

      const result = await service.reverse(jobId, issueId, { quantity: 5, reason: 'Wrong part installed' }, actor, undefined);

      expect(applyReversalMock).toHaveBeenCalledWith(expect.anything(), issueId, 5, PartIssueStatus.REVERSED, actor.id);
      expect(result.partIssueStatus).toBe(PartIssueStatus.REVERSED);
    });

    it('inserts the ISSUE_REVERSAL movement with exact on_hand increase, unchanged reserved, and mandatory reason', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const issueRow = { ...sampleIssue, quantity: 5, reversed_quantity: 0, store_id: storeId, part_id: partId };
      const lockIssueMock = jest.fn().mockResolvedValue(issueRow);
      const lockBalanceMock = jest.fn().mockResolvedValue({ ...sampleBalance, on_hand: 8, reserved: 3 });
      const updateBalanceMock = jest.fn().mockResolvedValue({ on_hand: 10, reserved: 3 });
      const createMovementMock = jest.fn().mockResolvedValue(reversalMovementId);
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        repository: buildIssueRepository({
          lockIssue: lockIssueMock,
          lockBalanceForIssue: lockBalanceMock,
          updateBalanceForIssue: updateBalanceMock,
          createReversalMovement: createMovementMock,
        }),
        audit: { record: auditMock },
      });

      await service.reverse(jobId, issueId, { quantity: 2, reason: 'Wrong part installed' }, actor, undefined);

      expect(updateBalanceMock).toHaveBeenCalledWith(expect.anything(), storeId, partId, 2, 0);
      expect(createMovementMock).toHaveBeenCalledWith(expect.anything(), {
        storeId,
        partId,
        quantity: 2,
        onHandAfter: 10,
        reservedAfter: 3,
        unitCostAmount: issueRow.unit_cost_amount,
        unitCostCurrency: issueRow.unit_cost_currency,
        jobId,
        partIssueId: issueId,
        actorId: actor.id,
        reason: 'Wrong part installed',
      });
      expect(auditMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'PART_ISSUE.REVERSE', entityType: 'PART_ISSUE', entityId: issueId, outcome: 'SUCCESS' }),
      );
    });

    it('locks job, then part issue, then stock balance in order', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const lockIssueMock = jest.fn().mockResolvedValue(sampleIssue);
      const lockBalanceMock = jest.fn().mockResolvedValue(sampleBalance);
      const auditMock = jest.fn().mockResolvedValue(undefined);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        repository: buildIssueRepository({ lockIssue: lockIssueMock, lockBalanceForIssue: lockBalanceMock }),
        audit: { record: auditMock },
      });

      await service.reverse(jobId, issueId, { quantity: 1, reason: 'Wrong part installed' }, actor, undefined);

      const jobOrder = findJobMock.mock.invocationCallOrder[0];
      const issueOrder = lockIssueMock.mock.invocationCallOrder[0];
      const balanceOrder = lockBalanceMock.mock.invocationCallOrder[0];
      expect(jobOrder).toBeLessThan(issueOrder);
      expect(issueOrder).toBeLessThan(balanceOrder);
    });

    it('rethrows unexpected database errors untouched', async () => {
      const findJobMock = jest.fn().mockResolvedValue(sampleJob);
      const unexpectedError = new Error('Database crash');
      const lockIssueMock = jest.fn().mockRejectedValue(unexpectedError);

      const service = buildService({
        jobsRepository: { findScoped: findJobMock },
        repository: buildIssueRepository({ lockIssue: lockIssueMock }),
      });

      await expect(
        service.reverse(jobId, issueId, { quantity: 1, reason: 'Wrong part installed' }, actor, undefined),
      ).rejects.toThrow(unexpectedError);
    });

    describe('idempotency', () => {
      it('replays an identical same-caller, same-key reversal without re-mutating stock', async () => {
        const findJobMock = jest.fn().mockResolvedValue(sampleJob);
        const findIssueByIdMock = jest.fn().mockResolvedValue(sampleIssue);
        const existingReversal: PartIssueReversalRow = {
          id: 'reversal-1',
          part_issue_id: issueId,
          quantity: 1,
          reason: 'Wrong part installed',
          reversed_by: actor.id,
          reversed_at: new Date(),
          stock_movement_id: reversalMovementId,
          idempotency_key: 'a-valid-key-123',
        };
        const findByKeyMock = jest.fn().mockResolvedValue(existingReversal);
        const createReversalMock = jest.fn();
        const createMovementMock = jest.fn();
        const updateBalanceMock = jest.fn();
        const applyReversalMock = jest.fn();
        const auditMock = jest.fn();

        const service = buildService({
          jobsRepository: { findScoped: findJobMock },
          repository: buildIssueRepository({
            findReversalByIdempotencyKey: findByKeyMock,
            findIssueById: findIssueByIdMock,
            createReversal: createReversalMock,
            createReversalMovement: createMovementMock,
            updateBalanceForIssue: updateBalanceMock,
            applyReversal: applyReversalMock,
          }),
          audit: { record: auditMock },
        });

        const result = await service.reverse(
          jobId,
          issueId,
          { quantity: 1, reason: 'Wrong part installed' },
          actor,
          'a-valid-key-123',
        );

        expect(result).toMatchObject({ id: 'reversal-1', partIssueStatus: sampleIssue.status });
        expect(createReversalMock).not.toHaveBeenCalled();
        expect(createMovementMock).not.toHaveBeenCalled();
        expect(updateBalanceMock).not.toHaveBeenCalled();
        expect(applyReversalMock).not.toHaveBeenCalled();
        expect(auditMock).not.toHaveBeenCalled();
      });

      it('rejects a same-key reversal with a different quantity/reason with 409 IDEMPOTENCY_CONFLICT', async () => {
        const findJobMock = jest.fn().mockResolvedValue(sampleJob);
        const findIssueByIdMock = jest.fn().mockResolvedValue(sampleIssue);
        const existingReversal: PartIssueReversalRow = {
          id: 'reversal-1',
          part_issue_id: issueId,
          quantity: 4, // different from the requested quantity below
          reason: 'Wrong part installed',
          reversed_by: actor.id,
          reversed_at: new Date(),
          stock_movement_id: reversalMovementId,
          idempotency_key: 'a-valid-key-123',
        };
        const findByKeyMock = jest.fn().mockResolvedValue(existingReversal);

        const service = buildService({
          jobsRepository: { findScoped: findJobMock },
          repository: buildIssueRepository({ findReversalByIdempotencyKey: findByKeyMock, findIssueById: findIssueByIdMock }),
        });

        await expect(
          service.reverse(jobId, issueId, { quantity: 1, reason: 'Wrong part installed' }, actor, 'a-valid-key-123'),
        ).rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT, code: ErrorCode.IDEMPOTENCY_CONFLICT });
      });

      it('rejects a same-key reversal from a different caller with 409 IDEMPOTENCY_CONFLICT', async () => {
        const findJobMock = jest.fn().mockResolvedValue(sampleJob);
        const findIssueByIdMock = jest.fn().mockResolvedValue(sampleIssue);
        const existingReversal: PartIssueReversalRow = {
          id: 'reversal-1',
          part_issue_id: issueId,
          quantity: 1,
          reason: 'Wrong part installed',
          reversed_by: 'someone-else',
          reversed_at: new Date(),
          stock_movement_id: reversalMovementId,
          idempotency_key: 'a-valid-key-123',
        };
        const findByKeyMock = jest.fn().mockResolvedValue(existingReversal);

        const service = buildService({
          jobsRepository: { findScoped: findJobMock },
          repository: buildIssueRepository({ findReversalByIdempotencyKey: findByKeyMock, findIssueById: findIssueByIdMock }),
        });

        await expect(
          service.reverse(jobId, issueId, { quantity: 1, reason: 'Wrong part installed' }, actor, 'a-valid-key-123'),
        ).rejects.toMatchObject({ statusCode: HttpStatus.CONFLICT, code: ErrorCode.IDEMPOTENCY_CONFLICT });
      });

      it('serializes concurrent same-key reversals by acquiring the advisory lock before lookup', async () => {
        const findJobMock = jest.fn().mockResolvedValue(sampleJob);
        const acquireLockMock = jest.fn().mockResolvedValue(undefined);
        const findByKeyMock = jest.fn().mockResolvedValue(null);
        const auditMock = jest.fn().mockResolvedValue(undefined);

        const service = buildService({
          jobsRepository: { findScoped: findJobMock },
          repository: buildIssueRepository({
            acquireIdempotencyLock: acquireLockMock,
            findReversalByIdempotencyKey: findByKeyMock,
          }),
          audit: { record: auditMock },
        });

        await service.reverse(jobId, issueId, { quantity: 1, reason: 'Wrong part installed' }, actor, 'a-valid-key-123');

        expect(acquireLockMock).toHaveBeenCalledWith(expect.anything(), 'part_issue_reversal', 'a-valid-key-123');
        const lockOrder = acquireLockMock.mock.invocationCallOrder[0];
        const findOrder = findByKeyMock.mock.invocationCallOrder[0];
        expect(lockOrder).toBeLessThan(findOrder);
      });

      it('conceals reversal replay with 404 NOT_FOUND when technician is not assigned to the job', async () => {
        const findJobMock = jest.fn().mockResolvedValue(null);
        const technicianActor: AuthenticatedPrincipal = {
          ...actor,
          roles: ['TECHNICIAN'],
          permissions: ['inventory.reverse'],
        };
        const existingReversal: PartIssueReversalRow = {
          id: 'reversal-1',
          part_issue_id: issueId,
          quantity: 1,
          reason: 'Wrong part installed',
          reversed_by: technicianActor.id,
          reversed_at: new Date(),
          stock_movement_id: reversalMovementId,
          idempotency_key: 'a-valid-key-123',
        };
        const findByKeyMock = jest.fn().mockResolvedValue(existingReversal);

        const service = buildService({
          jobsRepository: { findScoped: findJobMock },
          repository: buildIssueRepository({ findReversalByIdempotencyKey: findByKeyMock }),
        });

        await expect(
          service.reverse(jobId, issueId, { quantity: 1, reason: 'Wrong part installed' }, technicianActor, 'a-valid-key-123'),
        ).rejects.toMatchObject({ statusCode: HttpStatus.NOT_FOUND, code: ErrorCode.NOT_FOUND });

        expect(findJobMock).toHaveBeenCalledWith(jobId, [scopeId], expect.anything(), false, technicianActor.id);
      });

      it('allows scoped non-technician without jobs.read to replay an idempotent reversal', async () => {
        const findJobMock = jest.fn().mockResolvedValue(sampleJob);
        const findIssueByIdMock = jest.fn().mockResolvedValue(sampleIssue);
        const nonTechnicianActor: AuthenticatedPrincipal = {
          ...actor,
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          roles: ['STOREKEEPER_PROCUREMENT'],
          permissions: ['inventory.reverse'],
        };
        const existingReversal: PartIssueReversalRow = {
          id: 'reversal-1',
          part_issue_id: issueId,
          quantity: 1,
          reason: 'Wrong part installed',
          reversed_by: nonTechnicianActor.id,
          reversed_at: new Date(),
          stock_movement_id: reversalMovementId,
          idempotency_key: 'a-valid-key-123',
        };
        const findByKeyMock = jest.fn().mockResolvedValue(existingReversal);

        const service = buildService({
          jobsRepository: { findScoped: findJobMock },
          repository: buildIssueRepository({
            findReversalByIdempotencyKey: findByKeyMock,
            findIssueById: findIssueByIdMock,
          }),
        });

        const result = await service.reverse(
          jobId,
          issueId,
          { quantity: 1, reason: 'Wrong part installed' },
          nonTechnicianActor,
          'a-valid-key-123',
        );

        expect(result).toMatchObject({ id: 'reversal-1', partIssueStatus: sampleIssue.status });
        expect(findJobMock).toHaveBeenCalledWith(jobId, [scopeId], expect.anything(), false, undefined);
      });
    });
  });
});

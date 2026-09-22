import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { JobRow, JobsRepository, StageEventRow, WorkItemRow } from './jobs.repository';
import { JobsService } from './jobs.service';

const auditRecord = jest.fn();
const audit = { record: auditRecord } as unknown as AuditService;

const scopeId = '22222222-2222-4222-8222-222222222222';
const jobId = '11111111-1111-4111-8111-111111111111';
const vehicleId = '33333333-3333-4333-8333-333333333333';
const bayId = '44444444-4444-4444-8444-444444444444';
const techId = '55555555-5555-4555-8555-555555555555';
const actor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'manager@example.test', displayName: 'Manager',
  preferredLocale: 'en', roles: ['WORKSHOP_MANAGER'],
  permissions: ['jobs.read', 'jobs.create', 'jobs.update', 'jobs.assign', 'labor.write'],
  organizationScopeIds: [scopeId], mustChangePassword: false,
};
const technicianActor: AuthenticatedPrincipal = {
  ...actor, id: techId, roles: ['TECHNICIAN'], permissions: ['jobs.read.assigned', 'labor.write'],
};
const job = (stage: JobRow['stage'] = 'RECEIVED'): JobRow => ({
  id: jobId, job_number: 'JC-2026-000001', customer_id: '66666666-6666-4666-8666-666666666666',
  customer_display_name: 'Customer', vehicle_id: vehicleId, vehicle_plate: 'ABC123', organization_scope_id: scopeId,
  complaint: 'Brake noise', service_type: 'REPAIR', priority: 'NORMAL', mileage_at_intake: 100, stage,
  stage_changed_at: new Date('2026-01-01T00:00:00Z'), bay_id: null, technician_id: null,
  scheduled_start_at: null, expected_completion_at: new Date('2026-10-02T15:00:00Z'), delivered_at: null,
  version: 1, created_at: new Date(), updated_at: new Date(), created_by: actor.id, updated_by: actor.id,
  billable_work_allowed: false, approved_scopes: [], pending_approval_count: 0,
});
const item: WorkItemRow = {
  id: '77777777-7777-4777-8777-777777777777', job_id: jobId, description: 'Inspect brakes', status: 'PENDING',
  is_additional_work: false, approval_id: null, completed_at: null, created_at: new Date(), updated_at: new Date(),
  created_by: actor.id, updated_by: actor.id,
};
const transaction = (client: unknown = {}) => ({
  runInTransaction: jest.fn(async (work: (value: never) => unknown) => work(client as never)),
}) as unknown as TransactionService;

describe('JobsService', () => {
  it('creates a job in one transaction, validates vehicle mileage, records the initial event and items', async () => {
    const findAccessibleVehicle = jest.fn().mockResolvedValue({ id: vehicleId, customer_id: job(job().stage).customer_id, organization_scope_id: scopeId, mileage: 100, status: 'ACTIVE' });
    const create = jest.fn().mockResolvedValue(job());
    const createStageEvent = jest.fn();
    const createWorkItem = jest.fn().mockResolvedValue(item);
    const findById = jest.fn().mockResolvedValue(job());
    const repository = {
      findAccessibleVehicle, create, createStageEvent, createWorkItem, findById,
    } as unknown as JobsRepository;
    const runInTransaction = jest.fn(async (work: (value: never) => unknown) => work({} as never));
    const service = new JobsService(repository, { runInTransaction } as unknown as TransactionService, new ScopeService(), audit);
    await expect(service.create({
      vehicleId, complaint: 'Brake noise', serviceType: 'REPAIR', priority: 'NORMAL', mileageAtIntake: 100,
      expectedCompletionAt: '2026-10-02T15:00:00Z', workItems: [{ description: 'Inspect brakes' }],
    }, actor)).resolves.toMatchObject({ jobNumber: 'JC-2026-000001', customerId: job().customer_id });
    expect(runInTransaction.mock.calls).toHaveLength(1);
    expect(createStageEvent.mock.calls).toContainEqual([expect.anything(), jobId, actor.id]);
    expect(createWorkItem.mock.calls).toContainEqual([expect.anything(), expect.objectContaining({ jobId, isAdditionalWork: false })]);
    findAccessibleVehicle.mockResolvedValue({ ...job(), mileage: 101, status: 'ACTIVE' });
    await expect(service.create({ vehicleId, complaint: 'Brake noise', serviceType: 'REPAIR', priority: 'NORMAL', mileageAtIntake: 100, expectedCompletionAt: '2026-10-02T15:00:00Z' }, actor)).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('conceals inaccessible assigned jobs from technicians while managers can read scoped rows', async () => {
    const findScoped = jest.fn().mockResolvedValue(null);
    const repository = { findScoped } as unknown as JobsRepository;
    const service = new JobsService(repository, {} as TransactionService, new ScopeService(), audit);
    await expect(service.get(jobId, technicianActor)).rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
    expect(findScoped.mock.calls).toContainEqual([jobId, [scopeId], undefined, false, techId]);
  });

  it('rejects lifecycle metadata updates and preserves stale-version protection', async () => {
    const findScoped = jest.fn().mockResolvedValue(job('DELIVERED'));
    const update = jest.fn();
    const repository = {
      findScoped, update,
    } as unknown as JobsRepository;
    const service = new JobsService(repository, transaction(), new ScopeService(), audit);
    await expect(service.update(jobId, { version: 1, priority: 'HIGH' }, actor)).rejects.toMatchObject({ code: ErrorCode.JOB_STAGE_NOT_ALLOWED });
    findScoped.mockResolvedValue(job());
    update.mockResolvedValue(null);
    await expect(service.update(jobId, { version: 99, priority: 'HIGH' }, actor)).rejects.toMatchObject({ code: ErrorCode.VERSION_CONFLICT });
  });

  it('validates technician and bay assignment, checks conflicts, and only updates after locks/checks', async () => {
    const findAccessibleBay = jest.fn().mockResolvedValue({ id: bayId, organization_scope_id: scopeId, status: 'ACTIVE' });
    const findScoped = jest.fn().mockResolvedValue(job());
    const findAssignableTechnician = jest.fn().mockResolvedValue({ id: techId, display_name: 'Tech' });
    const findAssignmentConflicts = jest.fn().mockResolvedValue([]);
    const assign = jest.fn().mockResolvedValue({ ...job(), bay_id: bayId, technician_id: techId });
    const repository = {
      findAccessibleBay, findScoped, findAssignableTechnician, findAssignmentConflicts, assign,
    } as unknown as JobsRepository;
    const runInTransaction = jest.fn(async (work: (value: never) => unknown) => work({} as never));
    const service = new JobsService(repository, { runInTransaction } as unknown as TransactionService, new ScopeService(), audit);
    await expect(service.assign(jobId, {
      version: 1, bayId, technicianId: techId,
      scheduledStartAt: '2026-10-02T09:00:00Z', expectedCompletionAt: '2026-10-02T10:00:00Z',
    }, actor)).resolves.toMatchObject({ bayId, technicianId: techId });
    expect(runInTransaction.mock.calls).toHaveLength(1);
    expect(findAccessibleBay.mock.calls).toContainEqual([bayId, [scopeId], expect.anything(), true]);
    expect(findAssignableTechnician.mock.calls).toContainEqual([techId, scopeId, expect.anything(), true]);
    expect(findScoped.mock.invocationCallOrder[0]).toBeLessThan(
      findAccessibleBay.mock.invocationCallOrder[0],
    );
    expect(findAccessibleBay.mock.invocationCallOrder[0]).toBeLessThan(
      findAssignableTechnician.mock.invocationCallOrder[0],
    );
    expect(assign.mock.invocationCallOrder[0]).toBeGreaterThan(
      findAssignmentConflicts.mock.invocationCallOrder[0],
    );

    findAssignableTechnician.mockResolvedValue(null);
    await expect(service.assign(jobId, {
      version: 1, bayId, technicianId: techId,
      scheduledStartAt: '2026-10-02T09:00:00Z', expectedCompletionAt: '2026-10-02T10:00:00Z',
    }, actor)).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('reports an unavailable bay as a non-overridable scheduling conflict', async () => {
    const assign = jest.fn();
    const repository = {
      findScoped: jest.fn().mockResolvedValue(job()),
      findAccessibleBay: jest.fn().mockResolvedValue({ id: bayId, organization_scope_id: scopeId, status: 'MAINTENANCE' }),
      findAssignableTechnician: jest.fn().mockResolvedValue({ id: techId, display_name: 'Tech' }),
      assign,
    } as unknown as JobsRepository;
    const service = new JobsService(repository, transaction(), new ScopeService(), audit);
    await expect(service.assign(jobId, {
      version: 1, bayId, technicianId: techId,
      scheduledStartAt: '2026-10-02T09:00:00Z', expectedCompletionAt: '2026-10-02T10:00:00Z',
    }, actor)).rejects.toMatchObject({
      code: ErrorCode.SCHEDULE_CONFLICT,
      conflicts: [expect.objectContaining({ kind: 'BAY_UNAVAILABLE', overridable: false, bayId })],
    });
    expect(assign.mock.calls).toHaveLength(0);
  });

  it('requires assigned technicians for checklist status changes and preserves scoped 404s', async () => {
    const findScoped = jest.fn().mockResolvedValue(job());
    const updateWorkItem = jest.fn().mockResolvedValue({ ...item, status: 'DONE', completed_at: new Date() });
    const repository = {
      findScoped, findWorkItem: jest.fn().mockResolvedValue(item), updateWorkItem,
    } as unknown as JobsRepository;
    const service = new JobsService(repository, transaction(), new ScopeService(), audit);
    await expect(service.updateWorkItem(jobId, item.id, { status: 'DONE' }, technicianActor)).rejects.toMatchObject({ code: ErrorCode.INVALID_STATE_TRANSITION });
    findScoped.mockResolvedValue({ ...job('IN_PROGRESS'), technician_id: techId });
    await expect(service.updateWorkItem(jobId, item.id, { status: 'DONE' }, technicianActor)).resolves.toMatchObject({ status: 'DONE', completedAt: expect.any(Date) });
    expect(updateWorkItem.mock.calls).toContainEqual([expect.anything(), item.id, expect.objectContaining({ status: 'DONE', completed_at: expect.any(Date) }), techId]);
    await expect(service.updateWorkItem(jobId, item.id, { status: 'CANCELLED' }, technicianActor)).rejects.toMatchObject({ statusCode: 403, code: ErrorCode.FORBIDDEN });
  });

  it('conceals work items outside the job scope before reading them', async () => {
    const listWorkItems = jest.fn();
    const repository = {
      findScoped: jest.fn().mockResolvedValue(null),
      listWorkItems,
    } as unknown as JobsRepository;
    const service = new JobsService(repository, {} as TransactionService, new ScopeService(), audit);
    await expect(service.listWorkItems(jobId, { page: 1, pageSize: 20 }, actor))
      .rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
    expect(listWorkItems.mock.calls).toHaveLength(0);
  });

  it('rejects an unallowlisted work-item sort before querying items', async () => {
    const listWorkItems = jest.fn();
    const repository = {
      findScoped: jest.fn().mockResolvedValue(job()),
      listWorkItems,
    } as unknown as JobsRepository;
    const service = new JobsService(repository, {} as TransactionService, new ScopeService(), audit);
    await expect(service.listWorkItems(jobId, { page: 1, pageSize: 20, sort: 'status' }, actor))
      .rejects.toMatchObject({ statusCode: 400, code: ErrorCode.BAD_REQUEST });
    expect(listWorkItems.mock.calls).toHaveLength(0);
  });

  it('maps only the authoritative job-number constraint', async () => {
    const create = jest.fn().mockRejectedValue({ code: '23505', constraint: 'uq_job_number' });
    const repository = {
      findAccessibleVehicle: jest.fn().mockResolvedValue({
        id: vehicleId, customer_id: job().customer_id, organization_scope_id: scopeId, mileage: 1, status: 'ACTIVE',
      }),
      create,
    } as unknown as JobsRepository;
    const service = new JobsService(repository, transaction(), new ScopeService(), audit);
    await expect(service.create({
      vehicleId, complaint: 'Brake noise', serviceType: 'REPAIR', priority: 'NORMAL', mileageAtIntake: 1,
      expectedCompletionAt: '2026-10-02T15:00:00Z',
    }, actor)).rejects.toMatchObject({ code: ErrorCode.DUPLICATE_RESOURCE });

    const unexpected = { code: '23505', constraint: 'some_other_constraint' };
    create.mockRejectedValue(unexpected);
    await expect(service.create({
      vehicleId, complaint: 'Brake noise', serviceType: 'REPAIR', priority: 'NORMAL', mileageAtIntake: 1,
      expectedCompletionAt: '2026-10-02T15:00:00Z',
    }, actor)).rejects.toBe(unexpected);
  });

  it('returns explainable schedule conflicts and preserves unexpected database failures', async () => {
    const repository = {
      findAccessibleBay: jest.fn().mockResolvedValue({ id: bayId, organization_scope_id: scopeId, status: 'ACTIVE' }),
      findScoped: jest.fn().mockResolvedValue(job()),
      findAssignableTechnician: jest.fn().mockResolvedValue({ id: techId, display_name: 'Tech' }),
      findAssignmentConflicts: jest.fn().mockResolvedValue([{ kind: 'BAY_JOB_CONFLICT', reference_id: jobId, reference_label: 'JC-2026-000001', starts_at: new Date(), ends_at: new Date() }]),
      assign: jest.fn(),
    } as unknown as JobsRepository;
    const service = new JobsService(repository, transaction(), new ScopeService(), audit);
    await expect(service.assign(jobId, { version: 1, bayId, technicianId: techId, scheduledStartAt: '2026-10-02T09:00:00Z', expectedCompletionAt: '2026-10-02T10:00:00Z' }, actor)).rejects.toMatchObject({ code: ErrorCode.SCHEDULE_CONFLICT, conflicts: [expect.objectContaining({ kind: 'BAY_JOB_CONFLICT', overridable: false })] });

    const unexpected = new Error('database unavailable');
    const failing = {
      findAccessibleVehicle: jest.fn().mockResolvedValue({ id: vehicleId, customer_id: job().customer_id, organization_scope_id: scopeId, mileage: 1, status: 'ACTIVE' }),
      create: jest.fn().mockRejectedValue(unexpected),
    } as unknown as JobsRepository;
    await expect(new JobsService(failing, transaction(), new ScopeService(), audit).create({ vehicleId, complaint: 'Brake noise', serviceType: 'REPAIR', priority: 'NORMAL', mileageAtIntake: 1, expectedCompletionAt: '2026-10-02T15:00:00Z' }, actor)).rejects.toBe(unexpected);
  });
});

describe('JobsService.transition', () => {
  const managerActor: AuthenticatedPrincipal = {
    ...actor,
    permissions: ['jobs.read', 'jobs.transition.start', 'jobs.transition.submit-qc', 'jobs.transition.ready', 'jobs.transition.deliver'],
  };
  const qualityActor: AuthenticatedPrincipal = {
    ...actor, id: '99999999-9999-4999-8999-999999999999', roles: ['QUALITY_CHECKER'], permissions: ['jobs.read', 'quality.perform'],
  };

  const mockRepo = () => ({
    findScoped: jest.fn(),
    transitionStage: jest.fn(),
    recordTransition: jest.fn(),
    findLatestQualityCheck: jest.fn(),
    countIncompleteWorkItems: jest.fn(),
    hasNonVoidInvoice: jest.fn(),
    generateDraftInvoice: jest.fn(),
    findById: jest.fn(),
  });

  beforeEach(() => jest.clearAllMocks());

  it('requires bay+technician assignment and an approved INITIAL_WORK approval before starting', async () => {
    const repository = mockRepo();
    repository.findScoped.mockResolvedValue({ ...job(), bay_id: null, technician_id: null });
    const service = new JobsService(repository as unknown as JobsRepository, transaction(), new ScopeService(), audit);
    await expect(service.transition(jobId, { toStage: 'IN_PROGRESS', expectedFromStage: 'RECEIVED' } as never, managerActor))
      .rejects.toMatchObject({ code: ErrorCode.JOB_ASSIGNMENT_REQUIRED });

    repository.findScoped.mockResolvedValue({ ...job(), bay_id: bayId, technician_id: techId, billable_work_allowed: false });
    await expect(service.transition(jobId, { toStage: 'IN_PROGRESS', expectedFromStage: 'RECEIVED' } as never, managerActor))
      .rejects.toMatchObject({ code: ErrorCode.CUSTOMER_APPROVAL_REQUIRED });
  });

  it('starts a job in one transaction, records history, and writes an audit event', async () => {
    const repository = mockRepo();
    const current = { ...job(), bay_id: bayId, technician_id: techId, billable_work_allowed: true, version: 3 };
    repository.findScoped.mockResolvedValue(current);
    repository.transitionStage.mockResolvedValue({ ...job('IN_PROGRESS') });
    repository.findById.mockResolvedValue({ ...job('IN_PROGRESS') });
    const runInTransaction = jest.fn(async (work: (value: never) => unknown) => work({} as never));
    const service = new JobsService(repository as unknown as JobsRepository, { runInTransaction } as unknown as TransactionService, new ScopeService(), audit);
    await expect(service.transition(jobId, { toStage: 'IN_PROGRESS', expectedFromStage: 'RECEIVED' } as never, managerActor))
      .resolves.toMatchObject({ stage: 'IN_PROGRESS' });
    expect(runInTransaction.mock.calls).toHaveLength(1);
    expect(repository.transitionStage.mock.calls[0]).toEqual([expect.anything(), jobId, 3, 'IN_PROGRESS', managerActor.id, false]);
    expect(repository.recordTransition.mock.calls[0]).toEqual([expect.anything(), jobId, 'RECEIVED', 'IN_PROGRESS', managerActor.id, undefined]);
    expect(auditRecord.mock.calls[0][1]).toMatchObject({ action: 'JOB_CARD.TRANSITION', entityId: jobId });
  });

  it('rejects a stale expectedFromStage with a version conflict before checking anything else', async () => {
    const repository = mockRepo();
    repository.findScoped.mockResolvedValue(job('IN_PROGRESS'));
    const service = new JobsService(repository as unknown as JobsRepository, transaction(), new ScopeService(), audit);
    await expect(service.transition(jobId, { toStage: 'QUALITY_CHECK', expectedFromStage: 'RECEIVED' } as never, managerActor))
      .rejects.toMatchObject({ statusCode: 409, code: ErrorCode.VERSION_CONFLICT });
  });

  it('rejects lifecycle moves outside the allowed transition set', async () => {
    const repository = mockRepo();
    repository.findScoped.mockResolvedValue(job('RECEIVED'));
    const service = new JobsService(repository as unknown as JobsRepository, transaction(), new ScopeService(), audit);
    await expect(service.transition(jobId, { toStage: 'READY', expectedFromStage: 'RECEIVED' } as never, managerActor))
      .rejects.toMatchObject({ code: ErrorCode.INVALID_STATE_TRANSITION });
  });

  it('enforces the target-specific permission even when the pair is otherwise valid', async () => {
    const repository = mockRepo();
    repository.findScoped.mockResolvedValue({ ...job(), bay_id: bayId, technician_id: techId, billable_work_allowed: true });
    const service = new JobsService(repository as unknown as JobsRepository, transaction(), new ScopeService(), audit);
    await expect(service.transition(jobId, { toStage: 'IN_PROGRESS', expectedFromStage: 'RECEIVED' } as never, actor))
      .rejects.toMatchObject({ statusCode: 403, code: ErrorCode.FORBIDDEN });
  });

  it('conceals jobs not assigned to the acting technician', async () => {
    const repository = mockRepo();
    repository.findScoped.mockResolvedValue(null);
    const service = new JobsService(repository as unknown as JobsRepository, transaction(), new ScopeService(), audit);
    await expect(service.transition(jobId, { toStage: 'IN_PROGRESS', expectedFromStage: 'RECEIVED' } as never, technicianActor))
      .rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
    expect(repository.findScoped.mock.calls[0]).toEqual([jobId, [scopeId], expect.anything(), true, techId]);
  });

  it('requires every non-cancelled work item to be DONE before submitting to quality check', async () => {
    const repository = mockRepo();
    repository.findScoped.mockResolvedValue(job('IN_PROGRESS'));
    repository.countIncompleteWorkItems.mockResolvedValue(1);
    const service = new JobsService(repository as unknown as JobsRepository, transaction(), new ScopeService(), audit);
    await expect(service.transition(jobId, { toStage: 'QUALITY_CHECK', expectedFromStage: 'IN_PROGRESS' } as never, managerActor))
      .rejects.toMatchObject({ code: ErrorCode.CHECKLIST_INCOMPLETE });
  });

  it('requires a reason and a FAILED quality check to rework a job', async () => {
    const repository = mockRepo();
    repository.findScoped.mockResolvedValue(job('QUALITY_CHECK'));
    const service = new JobsService(repository as unknown as JobsRepository, transaction(), new ScopeService(), audit);
    await expect(service.transition(jobId, { toStage: 'IN_PROGRESS', expectedFromStage: 'QUALITY_CHECK' } as never, qualityActor))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });

    repository.findLatestQualityCheck.mockResolvedValue({ result: 'PASSED' });
    await expect(service.transition(jobId, { toStage: 'IN_PROGRESS', expectedFromStage: 'QUALITY_CHECK', reason: 'Needs more work' } as never, qualityActor))
      .rejects.toMatchObject({ code: ErrorCode.QUALITY_CHECK_REQUIRED });
  });

  it('requires the latest quality check to be PASSED and atomically generates the DRAFT invoice for READY', async () => {
    const repository = mockRepo();
    const current = job('QUALITY_CHECK');
    repository.findScoped.mockResolvedValue(current);
    const service = new JobsService(repository as unknown as JobsRepository, transaction(), new ScopeService(), audit);
    repository.findLatestQualityCheck.mockResolvedValue({ result: 'FAILED' });
    await expect(service.transition(jobId, { toStage: 'READY', expectedFromStage: 'QUALITY_CHECK' } as never, managerActor))
      .rejects.toMatchObject({ code: ErrorCode.QUALITY_CHECK_REQUIRED });

    repository.findLatestQualityCheck.mockResolvedValue({ result: 'PASSED' });
    repository.transitionStage.mockResolvedValue(job('READY'));
    repository.findById.mockResolvedValue(job('READY'));
    await expect(service.transition(jobId, { toStage: 'READY', expectedFromStage: 'QUALITY_CHECK' } as never, managerActor))
      .resolves.toMatchObject({ stage: 'READY' });
    expect(repository.generateDraftInvoice.mock.calls[0]).toEqual([expect.anything(), jobId, current.customer_id, managerActor.id]);
  });

  it('propagates a failure during invoice generation so the surrounding transaction rolls back and no audit event is written', async () => {
    const repository = mockRepo();
    repository.findScoped.mockResolvedValue(job('QUALITY_CHECK'));
    repository.findLatestQualityCheck.mockResolvedValue({ result: 'PASSED' });
    repository.transitionStage.mockResolvedValue(job('READY'));
    const failure = new Error('invoice insert failed');
    repository.generateDraftInvoice.mockRejectedValue(failure);
    const runInTransaction = jest.fn(async (work: (value: never) => unknown) => work({} as never));
    const service = new JobsService(repository as unknown as JobsRepository, { runInTransaction } as unknown as TransactionService, new ScopeService(), audit);
    await expect(service.transition(jobId, { toStage: 'READY', expectedFromStage: 'QUALITY_CHECK' } as never, managerActor)).rejects.toBe(failure);
    expect(repository.recordTransition.mock.calls).toHaveLength(1);
    expect(auditRecord.mock.calls).toHaveLength(0);
  });

  it('maps a concurrent duplicate DRAFT invoice to 409 DUPLICATE_RESOURCE and preserves unrelated database errors', async () => {
    const repository = mockRepo();
    repository.findScoped.mockResolvedValue(job('QUALITY_CHECK'));
    repository.findLatestQualityCheck.mockResolvedValue({ result: 'PASSED' });
    repository.transitionStage.mockResolvedValue(job('READY'));
    repository.generateDraftInvoice.mockRejectedValue({ code: '23505', constraint: 'uq_invoices_one_nonvoid_per_job' });
    const service = new JobsService(repository as unknown as JobsRepository, transaction(), new ScopeService(), audit);
    await expect(service.transition(jobId, { toStage: 'READY', expectedFromStage: 'QUALITY_CHECK' } as never, managerActor))
      .rejects.toMatchObject({ statusCode: 409, code: ErrorCode.DUPLICATE_RESOURCE });

    const unexpected = { code: '23505', constraint: 'some_other_constraint' };
    repository.generateDraftInvoice.mockRejectedValue(unexpected);
    await expect(service.transition(jobId, { toStage: 'READY', expectedFromStage: 'QUALITY_CHECK' } as never, managerActor)).rejects.toBe(unexpected);
  });

  it('requires a non-void invoice before delivery and sets deliveredAt atomically', async () => {
    const repository = mockRepo();
    repository.findScoped.mockResolvedValue(job('READY'));
    repository.hasNonVoidInvoice.mockResolvedValue(false);
    const service = new JobsService(repository as unknown as JobsRepository, transaction(), new ScopeService(), audit);
    await expect(service.transition(jobId, { toStage: 'DELIVERED', expectedFromStage: 'READY' } as never, managerActor))
      .rejects.toMatchObject({ code: ErrorCode.INVOICE_REQUIRED });

    repository.hasNonVoidInvoice.mockResolvedValue(true);
    repository.transitionStage.mockResolvedValue(job('DELIVERED'));
    repository.findById.mockResolvedValue(job('DELIVERED'));
    await expect(service.transition(jobId, { toStage: 'DELIVERED', expectedFromStage: 'READY' } as never, managerActor))
      .resolves.toMatchObject({ stage: 'DELIVERED' });
    expect(repository.transitionStage.mock.calls[0]).toEqual([expect.anything(), jobId, job('READY').version, 'DELIVERED', managerActor.id, true]);
  });
});

describe('JobsService.listStageHistory', () => {
  it('conceals history for jobs outside scope and rejects unknown sort fields', async () => {
    const listStageEvents = jest.fn();
    const repository = { findScoped: jest.fn().mockResolvedValue(null), listStageEvents } as unknown as JobsRepository;
    const service = new JobsService(repository, {} as TransactionService, new ScopeService(), audit);
    await expect(service.listStageHistory(jobId, { page: 1, pageSize: 20 }, actor))
      .rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
    expect(listStageEvents).not.toHaveBeenCalled();

    const found = { findScoped: jest.fn().mockResolvedValue(job()), listStageEvents } as unknown as JobsRepository;
    const service2 = new JobsService(found, {} as TransactionService, new ScopeService(), audit);
    await expect(service2.listStageHistory(jobId, { page: 1, pageSize: 20, sort: 'toStage' }, actor))
      .rejects.toMatchObject({ statusCode: 400, code: ErrorCode.BAD_REQUEST });
  });

  it('maps the immutable, oldest-first stage timeline and omits fromStage for the initial event', async () => {
    const rows: StageEventRow[] = [
      { id: 'e1', job_id: jobId, from_stage: null, to_stage: 'RECEIVED', transitioned_by: actor.id, transitioned_at: new Date('2026-01-01T00:00:00Z'), reason: null },
      { id: 'e2', job_id: jobId, from_stage: 'RECEIVED', to_stage: 'IN_PROGRESS', transitioned_by: actor.id, transitioned_at: new Date('2026-01-02T00:00:00Z'), reason: null },
    ];
    const repository = {
      findScoped: jest.fn().mockResolvedValue(job()),
      listStageEvents: jest.fn().mockResolvedValue({ rows, totalItems: 2 }),
    } as unknown as JobsRepository;
    const service = new JobsService(repository, {} as TransactionService, new ScopeService(), audit);
    const result = await service.listStageHistory(jobId, { page: 1, pageSize: 20 }, actor);
    expect(result.items[0]).not.toHaveProperty('fromStage');
    expect(result.items[1]).toMatchObject({ fromStage: 'RECEIVED', toStage: 'IN_PROGRESS' });
  });
});

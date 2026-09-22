import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { JobsRepository } from '../jobs/jobs.repository';
import { LaborRepository } from './labor.repository';
import { LaborService } from './labor.service';

const scopeId = '22222222-2222-4222-8222-222222222222';
const jobId = '11111111-1111-4111-8111-111111111111';
const techId = '55555555-5555-4555-8555-555555555555';
const laborEntryId = '66666666-6666-4666-8666-666666666666';
const technicianActor: AuthenticatedPrincipal = {
  id: techId, email: 'tech@example.test', displayName: 'Tech', preferredLocale: 'en', roles: ['TECHNICIAN'],
  permissions: ['jobs.read.assigned', 'labor.read', 'labor.write'], organizationScopeIds: [scopeId], mustChangePassword: false,
};
const auditRecord = jest.fn();
const audit = { record: auditRecord } as unknown as AuditService;
const transaction = { runInTransaction: jest.fn(async (work: (value: never) => unknown) => work({} as never)) } as unknown as TransactionService;

const jobRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: jobId, stage: 'IN_PROGRESS', billable_work_allowed: true, ...overrides,
});

const laborRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: laborEntryId, job_id: jobId, work_item_id: null, technician_id: techId, work_date: new Date('2026-10-02T00:00:00Z'),
  duration_minutes: 90, description: null, hourly_rate_amount: '90.0000', hourly_rate_currency: 'USD',
  amount: '135.0000', amount_currency: 'USD', status: 'ACTIVE', void_reason: null, voided_at: null, voided_by: null,
  created_at: new Date(), updated_at: new Date(), created_by: techId, updated_by: techId,
  ...overrides,
});

describe('LaborService.create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires the authenticated technician to be assigned to the job', async () => {
    const findScoped = jest.fn().mockResolvedValue(null);
    const jobsRepository = { findScoped } as unknown as JobsRepository;
    const service = new LaborService({} as LaborRepository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.create(jobId, { workDate: '2026-10-02', durationMinutes: 90 } as never, technicianActor))
      .rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
    expect(findScoped.mock.calls).toEqual([[jobId, [scopeId], expect.anything(), true, techId]]);
  });

  it('requires the job to be IN_PROGRESS', async () => {
    const jobsRepository = { findScoped: jest.fn().mockResolvedValue(jobRow({ stage: 'QUALITY_CHECK' })) } as unknown as JobsRepository;
    const service = new LaborService({} as LaborRepository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.create(jobId, { workDate: '2026-10-02', durationMinutes: 90 } as never, technicianActor))
      .rejects.toMatchObject({ code: ErrorCode.JOB_STAGE_NOT_ALLOWED });
  });

  it('requires an APPROVED INITIAL_WORK approval before logging labor', async () => {
    const jobsRepository = { findScoped: jest.fn().mockResolvedValue(jobRow({ billable_work_allowed: false })) } as unknown as JobsRepository;
    const service = new LaborService({} as LaborRepository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.create(jobId, { workDate: '2026-10-02', durationMinutes: 90 } as never, technicianActor))
      .rejects.toMatchObject({ code: ErrorCode.CUSTOMER_APPROVAL_REQUIRED });
  });

  it('requires an APPROVED ADDITIONAL_WORK approval covering an additional-work item', async () => {
    const jobsRepository = {
      findScoped: jest.fn().mockResolvedValue(jobRow()),
      findWorkItem: jest.fn().mockResolvedValue({ id: 'w1', job_id: jobId, is_additional_work: true }),
    } as unknown as JobsRepository;
    const repository = { hasApprovedAdditionalWorkApproval: jest.fn().mockResolvedValue(false) } as unknown as LaborRepository;
    const service = new LaborService(repository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.create(jobId, { workDate: '2026-10-02', durationMinutes: 90, workItemId: 'w1' } as never, technicianActor))
      .rejects.toMatchObject({ code: ErrorCode.CUSTOMER_APPROVAL_REQUIRED });
  });

  it('validates the work item belongs to the URL job', async () => {
    const jobsRepository = { findScoped: jest.fn().mockResolvedValue(jobRow()), findWorkItem: jest.fn().mockResolvedValue(null) } as unknown as JobsRepository;
    const service = new LaborService({} as LaborRepository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.create(jobId, { workDate: '2026-10-02', durationMinutes: 90, workItemId: 'w1' } as never, technicianActor))
      .rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
  });

  it('snapshots the hourly rate, computes the amount server-side, selects the technician and audits creation', async () => {
    const jobsRepository = { findScoped: jest.fn().mockResolvedValue(jobRow()) } as unknown as JobsRepository;
    const computeAmount = jest.fn().mockResolvedValue('135.0000');
    const create = jest.fn().mockResolvedValue(laborRow());
    const repository = {
      findFinanceSettings: jest.fn().mockResolvedValue({ labor_hourly_rate: '90.0000', currency_code: 'USD' }),
      computeAmount,
      create,
    } as unknown as LaborRepository;
    const service = new LaborService(repository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.create(jobId, { workDate: '2026-10-02', durationMinutes: 90 } as never, technicianActor))
      .resolves.toMatchObject({ technicianId: techId, hourlyRate: { amount: '90.0000', currency: 'USD' }, amount: { amount: '135.0000', currency: 'USD' } });
    expect(computeAmount.mock.calls).toEqual([[expect.anything(), '90.0000', 90]]);
    expect(create.mock.calls[0][1]).toMatchObject({ technicianId: techId, amount: '135.0000' });
    expect(auditRecord.mock.calls[0][1]).toMatchObject({ action: 'LABOR_ENTRY.CREATE' });
  });
});

describe('LaborService.update', () => {
  beforeEach(() => jest.clearAllMocks());

  it('allows correction only during IN_PROGRESS or QUALITY_CHECK', async () => {
    const jobsRepository = { findScoped: jest.fn().mockResolvedValue(jobRow({ stage: 'READY' })) } as unknown as JobsRepository;
    const service = new LaborService({} as LaborRepository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.update(jobId, laborEntryId, { durationMinutes: 60, changeReason: 'fix' } as never, technicianActor))
      .rejects.toMatchObject({ code: ErrorCode.JOB_STAGE_NOT_ALLOWED });
  });

  it('rejects correcting an already-voided entry', async () => {
    const jobsRepository = { findScoped: jest.fn().mockResolvedValue(jobRow()) } as unknown as JobsRepository;
    const repository = { findLocked: jest.fn().mockResolvedValue(laborRow({ status: 'VOIDED' })) } as unknown as LaborRepository;
    const service = new LaborService(repository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.update(jobId, laborEntryId, { durationMinutes: 60, changeReason: 'fix' } as never, technicianActor))
      .rejects.toMatchObject({ code: ErrorCode.INVALID_STATE_TRANSITION });
  });

  it('recomputes the amount from the original rate snapshot and audits before/after values', async () => {
    const jobsRepository = { findScoped: jest.fn().mockResolvedValue(jobRow({ stage: 'QUALITY_CHECK' })) } as unknown as JobsRepository;
    const computeAmount = jest.fn().mockResolvedValue('90.0000');
    const update = jest.fn().mockResolvedValue(laborRow({ duration_minutes: 60, amount: '90.0000' }));
    const repository = {
      findLocked: jest.fn().mockResolvedValue(laborRow()),
      computeAmount,
      update,
    } as unknown as LaborRepository;
    const service = new LaborService(repository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.update(jobId, laborEntryId, { durationMinutes: 60, changeReason: 'Adjusted actual time' } as never, technicianActor))
      .resolves.toMatchObject({ durationMinutes: 60, amount: { amount: '90.0000', currency: 'USD' } });
    expect(computeAmount.mock.calls).toEqual([[expect.anything(), '90.0000', 60]]);
    expect(update.mock.calls).toEqual([[expect.anything(), laborEntryId, { duration_minutes: 60, amount: '90.0000' }, techId]]);
    expect(auditRecord.mock.calls[0][1]).toMatchObject({
      action: 'LABOR_ENTRY.CORRECT',
      changes: [expect.objectContaining({ before: expect.objectContaining({ durationMinutes: 90 }), after: expect.objectContaining({ durationMinutes: 60 }) })],
    });
  });
});

describe('LaborService.void', () => {
  beforeEach(() => jest.clearAllMocks());

  it('allows voiding only during IN_PROGRESS or QUALITY_CHECK, requires a reason, and audits', async () => {
    const jobsRepository = { findScoped: jest.fn().mockResolvedValue(jobRow({ stage: 'DELIVERED' })) } as unknown as JobsRepository;
    const service = new LaborService({} as LaborRepository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.void(jobId, laborEntryId, { reason: 'Wrong job' }, technicianActor)).rejects.toMatchObject({ code: ErrorCode.JOB_STAGE_NOT_ALLOWED });

    const scopedRepo = { findScoped: jest.fn().mockResolvedValue(jobRow()) } as unknown as JobsRepository;
    const voidEntry = jest.fn().mockResolvedValue(laborRow({ status: 'VOIDED', void_reason: 'Wrong job', voided_at: new Date(), voided_by: techId }));
    const repository = {
      findLocked: jest.fn().mockResolvedValue(laborRow()),
      void: voidEntry,
    } as unknown as LaborRepository;
    const service2 = new LaborService(repository, scopedRepo, transaction, new ScopeService(), audit);
    await expect(service2.void(jobId, laborEntryId, { reason: 'Wrong job' }, technicianActor))
      .resolves.toMatchObject({ status: 'VOIDED', voidReason: 'Wrong job' });
    expect(voidEntry.mock.calls).toEqual([[expect.anything(), laborEntryId, 'Wrong job', techId]]);
    expect(auditRecord.mock.calls[0][1]).toMatchObject({
      action: 'LABOR_ENTRY.VOID',
      changes: [{ field: 'status', before: 'ACTIVE', after: 'VOIDED' }],
    });
  });

  it('does not require the caller to be the assigned technician, unlike create/update, since the contract only requires labor.write for void', async () => {
    const findScoped = jest.fn().mockResolvedValue(jobRow());
    const jobsRepository = { findScoped } as unknown as JobsRepository;
    const repository = {
      findLocked: jest.fn().mockResolvedValue(laborRow()),
      void: jest.fn().mockResolvedValue(laborRow({ status: 'VOIDED', void_reason: 'Wrong job' })),
    } as unknown as LaborRepository;
    const managerActor: AuthenticatedPrincipal = { ...technicianActor, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', roles: ['WORKSHOP_MANAGER'], permissions: ['labor.write'] };
    const service = new LaborService(repository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.void(jobId, laborEntryId, { reason: 'Wrong job' }, managerActor)).resolves.toMatchObject({ status: 'VOIDED' });
    expect(findScoped.mock.calls).toEqual([[jobId, [scopeId], expect.anything(), true]]);
  });
});

describe('LaborService.list', () => {
  it('conceals labor entries for jobs outside scope', async () => {
    const jobsRepository = { findScoped: jest.fn().mockResolvedValue(null) } as unknown as JobsRepository;
    const list = jest.fn();
    const repository = { list } as unknown as LaborRepository;
    const service = new LaborService(repository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.list(jobId, { page: 1, pageSize: 20 }, technicianActor)).rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
    expect(list.mock.calls).toHaveLength(0);
  });
});

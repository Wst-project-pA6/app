import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { JobsRepository } from '../jobs/jobs.repository';
import { ApprovalsRepository } from './approvals.repository';
import { ApprovalsService } from './approvals.service';

const scopeId = '22222222-2222-4222-8222-222222222222';
const jobId = '11111111-1111-4111-8111-111111111111';
const actor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'advisor@example.test', displayName: 'Advisor',
  preferredLocale: 'en', roles: ['SERVICE_ADVISOR'], permissions: ['approvals.read', 'approvals.record'],
  organizationScopeIds: [scopeId], mustChangePassword: false,
};
const auditRecord = jest.fn();
const audit = { record: auditRecord } as unknown as AuditService;
const transaction = { runInTransaction: jest.fn(async (work: (value: never) => unknown) => work({} as never)) } as unknown as TransactionService;
const approval = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', job_id: jobId, scope: 'INITIAL_WORK', description: 'Initial diagnostic',
  estimated_amount: null, estimated_currency_code: null, status: 'PENDING', method: null, approved_by_name: null,
  decided_at: null, recorded_by: null, notes: null, created_at: new Date(), updated_at: new Date(),
  created_by: actor.id, updated_by: actor.id, work_item_ids: [], evidence_attachment_ids: [],
  ...overrides,
});

describe('ApprovalsService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('conceals approvals for jobs outside scope', async () => {
    const jobsRepository = { findScoped: jest.fn().mockResolvedValue(null) } as unknown as JobsRepository;
    const service = new ApprovalsService({} as ApprovalsRepository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.list(jobId, { page: 1, pageSize: 20 }, actor)).rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
  });

  it('requires ADDITIONAL_WORK approvals to reference at least one valid additional-work item', async () => {
    const jobsRepository = { findScoped: jest.fn().mockResolvedValue({ id: jobId }) } as unknown as JobsRepository;
    const repository = { validateWorkItems: jest.fn(), create: jest.fn(), linkWorkItems: jest.fn(), findById: jest.fn() } as unknown as ApprovalsRepository;
    const service = new ApprovalsService(repository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.create(jobId, { scope: 'ADDITIONAL_WORK', description: 'Replace brake pads' } as never, actor))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });

    (repository.validateWorkItems as jest.Mock).mockResolvedValue(false);
    await expect(service.create(jobId, { scope: 'ADDITIONAL_WORK', description: 'Replace brake pads', workItemIds: ['w1'] } as never, actor))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('creates a PENDING approval, links referenced work items and writes an audit event', async () => {
    const jobsRepository = { findScoped: jest.fn().mockResolvedValue({ id: jobId }) } as unknown as JobsRepository;
    const linkWorkItems = jest.fn();
    const repository = {
      validateWorkItems: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockResolvedValue('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
      linkWorkItems,
      findById: jest.fn().mockResolvedValue(approval({ scope: 'ADDITIONAL_WORK', work_item_ids: ['w1'] })),
    } as unknown as ApprovalsRepository;
    const service = new ApprovalsService(repository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.create(jobId, { scope: 'ADDITIONAL_WORK', description: 'Replace brake pads', workItemIds: ['w1'] } as never, actor))
      .resolves.toMatchObject({ scope: 'ADDITIONAL_WORK', status: 'PENDING', workItemIds: ['w1'] });
    expect(linkWorkItems.mock.calls).toEqual([[expect.anything(), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ['w1']]]);
    expect(auditRecord.mock.calls[0][1]).toMatchObject({ action: 'JOB_APPROVAL.CREATE' });
  });

  it('locks the approval before deciding and rejects a second decision', async () => {
    const jobsRepository = { findScoped: jest.fn().mockResolvedValue({ id: jobId }) } as unknown as JobsRepository;
    const decide = jest.fn();
    const repository = {
      findLocked: jest.fn().mockResolvedValue(approval({ status: 'APPROVED' })),
      linkEvidenceAttachments: jest.fn(),
      decide,
      findById: jest.fn(),
    } as unknown as ApprovalsRepository;
    const service = new ApprovalsService(repository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.decide(jobId, approval().id, { decision: 'APPROVED', method: 'PHONE', approvedByName: 'Jane' } as never, actor))
      .rejects.toMatchObject({ code: ErrorCode.INVALID_STATE_TRANSITION });
    expect(decide.mock.calls).toHaveLength(0);
  });

  it('records a decision with method, representative name, evidence and notes atomically', async () => {
    const jobsRepository = { findScoped: jest.fn().mockResolvedValue({ id: jobId }) } as unknown as JobsRepository;
    const decide = jest.fn();
    const repository = {
      findLocked: jest.fn().mockResolvedValue(approval()),
      linkEvidenceAttachments: jest.fn(),
      decide,
      findById: jest.fn().mockResolvedValue(approval({ status: 'APPROVED', method: 'PHONE', approved_by_name: 'Jane', decided_at: new Date() })),
    } as unknown as ApprovalsRepository;
    const service = new ApprovalsService(repository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.decide(jobId, approval().id, { decision: 'APPROVED', method: 'PHONE', approvedByName: 'Jane', notes: 'ok' } as never, actor))
      .resolves.toMatchObject({ status: 'APPROVED', approvedByName: 'Jane' });
    expect(decide.mock.calls[0]).toEqual([expect.anything(), approval().id, expect.objectContaining({ decision: 'APPROVED', method: 'PHONE', approvedByName: 'Jane' })]);
    expect(auditRecord.mock.calls[0][1]).toMatchObject({ action: 'JOB_APPROVAL.DECIDE' });
  });
});

import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { JobsRepository } from '../jobs/jobs.repository';
import { QualityRepository } from './quality.repository';
import { QualityService } from './quality.service';

const scopeId = '22222222-2222-4222-8222-222222222222';
const jobId = '11111111-1111-4111-8111-111111111111';
const techId = '55555555-5555-4555-8555-555555555555';
const qcActor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'qc@example.test', displayName: 'QC',
  preferredLocale: 'en', roles: ['QUALITY_CHECKER'], permissions: ['jobs.read', 'quality.perform'],
  organizationScopeIds: [scopeId], mustChangePassword: false,
};
const technicianActor: AuthenticatedPrincipal = { ...qcActor, id: techId, roles: ['TECHNICIAN'], permissions: ['jobs.read.assigned'] };
const auditRecord = jest.fn();
const audit = { record: auditRecord } as unknown as AuditService;
const transaction = { runInTransaction: jest.fn(async (work: (value: never) => unknown) => work({} as never)) } as unknown as TransactionService;

describe('QualityService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('restricts listing to assigned technicians while quality.perform holders see any in-scope job', async () => {
    const findScoped = jest.fn().mockResolvedValue(null);
    const jobsRepository = { findScoped } as unknown as JobsRepository;
    const service = new QualityService({} as QualityRepository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.list(jobId, { page: 1, pageSize: 20 }, technicianActor)).rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
    expect(findScoped).toHaveBeenCalledWith(jobId, [scopeId], undefined, false, techId);
  });

  it('requires the job to be in QUALITY_CHECK before recording a result', async () => {
    const jobsRepository = { findScoped: jest.fn().mockResolvedValue({ stage: 'IN_PROGRESS' }) } as unknown as JobsRepository;
    const service = new QualityService({} as QualityRepository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.create(jobId, { result: 'PASSED' } as never, qcActor)).rejects.toMatchObject({ code: ErrorCode.JOB_STAGE_NOT_ALLOWED });
  });

  it('requires notes for a FAILED result', async () => {
    const jobsRepository = { findScoped: jest.fn().mockResolvedValue({ stage: 'QUALITY_CHECK' }) } as unknown as JobsRepository;
    const service = new QualityService({} as QualityRepository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.create(jobId, { result: 'FAILED' } as never, qcActor)).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('records an immutable result, links evidence and audits without transitioning the job', async () => {
    const jobsRepository = { findScoped: jest.fn().mockResolvedValue({ stage: 'QUALITY_CHECK' }) } as unknown as JobsRepository;
    const linkEvidenceAttachments = jest.fn();
    const repository = {
      create: jest.fn().mockResolvedValue('q1'),
      linkEvidenceAttachments,
      findById: jest.fn().mockResolvedValue({
        id: 'q1', job_id: jobId, result: 'FAILED', notes: 'Paint defect', performed_by: qcActor.id,
        performed_at: new Date(), evidence_attachment_ids: ['e1'],
      }),
    } as unknown as QualityRepository;
    const service = new QualityService(repository, jobsRepository, transaction, new ScopeService(), audit);
    await expect(service.create(jobId, { result: 'FAILED', notes: 'Paint defect', evidenceAttachmentIds: ['e1'] } as never, qcActor))
      .resolves.toMatchObject({ result: 'FAILED', evidenceAttachmentIds: ['e1'] });
    expect(linkEvidenceAttachments.mock.calls).toEqual([[expect.anything(), 'q1', ['e1'], qcActor.id]]);
    expect(auditRecord.mock.calls[0][1]).toMatchObject({ action: 'QUALITY_CHECK.CREATE' });
  });
});

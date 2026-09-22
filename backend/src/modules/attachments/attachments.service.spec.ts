import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import { TestAttachmentStorage } from '../../common/storage/test-attachment-storage';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { JobsRepository } from '../jobs/jobs.repository';
import { signDownloadToken } from './download-token.util';
import { AttachmentsRepository } from './attachments.repository';
import { AttachmentsService } from './attachments.service';
import { AttachmentPurpose } from './dto/attachment.dto';

const scopeId = '22222222-2222-4222-8222-222222222222';
const jobId = '11111111-1111-4111-8111-111111111111';
const attachmentId = '33333333-3333-4333-8333-333333333333';
const authorizationId = '44444444-4444-4444-8444-444444444444';
const uploaderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherUserId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SIGNING_SECRET = 'unit-test-secret';

const uploader: AuthenticatedPrincipal = {
  id: uploaderId, email: 'a@example.test', displayName: 'A', preferredLocale: 'en',
  roles: ['TECHNICIAN'], permissions: ['attachments.upload', 'jobs.read.assigned'],
  organizationScopeIds: [scopeId], mustChangePassword: false,
};
const otherUser: AuthenticatedPrincipal = { ...uploader, id: otherUserId };
const jobReader: AuthenticatedPrincipal = { ...uploader, id: otherUserId, permissions: ['jobs.read'] };

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

function makeService(overrides: {
  repository?: Partial<AttachmentsRepository>;
  jobsRepository?: Partial<JobsRepository>;
  storage?: TestAttachmentStorage;
  now?: number;
} = {}) {
  const storage = overrides.storage ?? new TestAttachmentStorage();
  const record = jest.fn().mockResolvedValue(undefined);
  const audit = { record } as unknown as AuditService;
  const client = {};
  const transaction = {
    runInTransaction: jest.fn(async (work: (value: unknown) => unknown) => work(client)),
  } as unknown as TransactionService;
  const configService = {
    get: jest.fn((key: string) => ({
      'attachments.signingSecret': SIGNING_SECRET,
      'app.baseUrl': 'http://localhost:3000',
    })[key]),
  };
  const repository = {
    insert: jest.fn().mockResolvedValue({
      id: attachmentId, uploaded_by: uploaderId, file_name: 'photo.jpg', content_type: 'image/jpeg',
      size_bytes: JPEG_BYTES.length, sha256: 'x'.repeat(64), object_storage_key: 'key1.jpg',
      purpose: 'JOB_PHOTO', status: 'UNLINKED', owner_type: null, owner_id: null,
      created_at: new Date(overrides.now ?? 0), updated_at: new Date(overrides.now ?? 0),
    }),
    findById: jest.fn(),
    hasJobAccess: jest.fn().mockResolvedValue(false),
    hasApprovalJobAccess: jest.fn().mockResolvedValue(false),
    hasQualityCheckJobAccess: jest.fn().mockResolvedValue(false),
    isOwnAssessment: jest.fn().mockResolvedValue(false),
    insertDownloadAuthorization: jest.fn().mockResolvedValue({ id: authorizationId, expires_at: new Date(0) }),
    findDownloadAuthorization: jest.fn().mockResolvedValue(null),
    listForJob: jest.fn().mockResolvedValue({ rows: [], totalItems: 0 }),
    ...overrides.repository,
  } as unknown as AttachmentsRepository;
  const jobsRepository = {
    findScoped: jest.fn().mockResolvedValue(null),
    linkAttachments: jest.fn(),
    ...overrides.jobsRepository,
  } as unknown as JobsRepository;
  let now = overrides.now ?? 0;
  const clock = () => now;
  const setNow = (value: number) => { now = value; };
  const service = new AttachmentsService(
    repository, jobsRepository, transaction, new ScopeService(), audit, configService as never, storage, clock,
  );
  return { service, repository, jobsRepository, storage, audit: record, setNow };
}

describe('AttachmentsService.upload', () => {
  it('rejects a missing file with 422', async () => {
    const { service } = makeService();
    await expect(service.upload(undefined, { purpose: AttachmentPurpose.JOB_PHOTO }, uploader))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('rejects an empty file with 422', async () => {
    const { service } = makeService();
    const file = { originalname: 'x.jpg', mimetype: 'image/jpeg', size: 0, buffer: Buffer.alloc(0) };
    await expect(service.upload(file, { purpose: AttachmentPurpose.JOB_PHOTO }, uploader))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('rejects a declared type outside the allow-list with 415', async () => {
    const { service } = makeService();
    const file = { originalname: 'x.gif', mimetype: 'image/gif', size: 4, buffer: Buffer.from([0x47, 0x49, 0x46, 0x38]) };
    await expect(service.upload(file, { purpose: AttachmentPurpose.JOB_PHOTO }, uploader))
      .rejects.toMatchObject({ code: ErrorCode.UNSUPPORTED_MEDIA_TYPE, statusCode: 415 });
  });

  it('rejects content whose magic bytes do not match the declared type with 415', async () => {
    const { service } = makeService();
    const file = { originalname: 'x.jpg', mimetype: 'image/jpeg', size: 4, buffer: Buffer.from('not-a-jpeg') };
    await expect(service.upload(file, { purpose: AttachmentPurpose.JOB_PHOTO }, uploader))
      .rejects.toMatchObject({ code: ErrorCode.UNSUPPORTED_MEDIA_TYPE });
  });

  it('accepts a real JPEG, stores it under a random key, computes sha256 and sanitizes the name', async () => {
    const { service, storage, repository, audit } = makeService();
    const file = { originalname: '../evil/../name.jpg', mimetype: 'image/jpeg', size: JPEG_BYTES.length, buffer: JPEG_BYTES };
    const result = await service.upload(file, { purpose: AttachmentPurpose.JOB_PHOTO }, uploader);

    expect(result).toMatchObject({ id: attachmentId, status: 'UNLINKED', purpose: 'JOB_PHOTO' });
    expect(result).not.toHaveProperty('objectStorageKey');
    const insertCall = (repository.insert as jest.Mock).mock.calls[0][1];
    expect(insertCall.fileName).toBe('name.jpg');
    expect(insertCall.objectStorageKey).not.toContain('..');
    expect(insertCall.objectStorageKey).toMatch(/\.jpg$/u);
    expect(insertCall.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(storage.objects.has(insertCall.objectStorageKey)).toBe(true);
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'ATTACHMENT.UPLOAD' }));
  });

  it('removes the stored object when the database insert fails, leaving no orphaned file or row', async () => {
    const storage = new TestAttachmentStorage();
    const { service } = makeService({ storage, repository: { insert: jest.fn().mockRejectedValue(new Error('db down')) } });
    const file = { originalname: 'x.jpg', mimetype: 'image/jpeg', size: JPEG_BYTES.length, buffer: JPEG_BYTES };
    await expect(service.upload(file, { purpose: AttachmentPurpose.JOB_PHOTO }, uploader)).rejects.toThrow('db down');
    expect(storage.objects.size).toBe(0);
    expect(storage.removedKeys.length).toBe(1);
  });
});

describe('AttachmentsService.get authorization matrix', () => {
  it('returns 404 for a missing attachment', async () => {
    const { service } = makeService();
    await expect(service.get(attachmentId, uploader)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('allows only the uploader to read their own fresh UNLINKED attachment', async () => {
    const row = {
      id: attachmentId, uploaded_by: uploaderId, status: 'UNLINKED', owner_type: null, owner_id: null,
      created_at: new Date(0), file_name: 'x.jpg', content_type: 'image/jpeg', size_bytes: 1, sha256: 'x'.repeat(64), purpose: 'JOB_PHOTO',
    };
    const { service } = makeService({ repository: { findById: jest.fn().mockResolvedValue(row) }, now: 1000 });
    await expect(service.get(attachmentId, uploader)).resolves.toMatchObject({ id: attachmentId });
    await expect(service.get(attachmentId, otherUser)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('conceals an UNLINKED attachment once it is older than 24 hours, even for the uploader', async () => {
    const row = {
      id: attachmentId, uploaded_by: uploaderId, status: 'UNLINKED', owner_type: null, owner_id: null,
      created_at: new Date(0), file_name: 'x.jpg', content_type: 'image/jpeg', size_bytes: 1, sha256: 'x'.repeat(64), purpose: 'JOB_PHOTO',
    };
    const twentyFiveHoursMs = 25 * 60 * 60 * 1000;
    const { service } = makeService({ repository: { findById: jest.fn().mockResolvedValue(row) }, now: twentyFiveHoursMs });
    await expect(service.get(attachmentId, uploader)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('grants JOB_CARD access via jobs.read (any in-scope job) but restricts jobs.read.assigned to the technician check', async () => {
    const row = {
      id: attachmentId, uploaded_by: uploaderId, status: 'LINKED', owner_type: 'JOB_CARD', owner_id: 'job1',
      created_at: new Date(0), file_name: 'x.jpg', content_type: 'image/jpeg', size_bytes: 1, sha256: 'x'.repeat(64), purpose: 'JOB_PHOTO',
    };
    const hasJobAccess = jest.fn().mockResolvedValue(true);
    const { service, repository } = makeService({ repository: { findById: jest.fn().mockResolvedValue(row), hasJobAccess } });
    await expect(service.get(attachmentId, jobReader)).resolves.toMatchObject({ id: attachmentId });
    expect((repository.hasJobAccess as jest.Mock).mock.calls[0]).toEqual(['job1', [scopeId], undefined]);

    (repository.hasJobAccess as jest.Mock).mockClear();
    await expect(service.get(attachmentId, uploader)).resolves.toMatchObject({ id: attachmentId });
    expect((repository.hasJobAccess as jest.Mock).mock.calls[0]).toEqual(['job1', [scopeId], uploaderId]);
  });

  it('denies JOB_CARD access to an actor with neither jobs.read nor jobs.read.assigned, without even querying job access', async () => {
    const row = {
      id: attachmentId, uploaded_by: uploaderId, status: 'LINKED', owner_type: 'JOB_CARD', owner_id: 'job1',
      created_at: new Date(0), file_name: 'x.jpg', content_type: 'image/jpeg', size_bytes: 1, sha256: 'x'.repeat(64), purpose: 'JOB_PHOTO',
    };
    const hasJobAccess = jest.fn().mockResolvedValue(true);
    const storekeeper: AuthenticatedPrincipal = { ...uploader, permissions: ['parts.read'] };
    const { service } = makeService({ repository: { findById: jest.fn().mockResolvedValue(row), hasJobAccess } });
    await expect(service.get(attachmentId, storekeeper)).rejects.toMatchObject({ statusCode: 404 });
    expect(hasJobAccess).not.toHaveBeenCalled();
  });

  it('grants JOB_APPROVAL access via approvals.read with org-scope only (no technician restriction, matching ApprovalsService.list)', async () => {
    const row = {
      id: attachmentId, uploaded_by: uploaderId, status: 'LINKED', owner_type: 'JOB_APPROVAL', owner_id: 'approval1',
      created_at: new Date(0), file_name: 'x.jpg', content_type: 'image/jpeg', size_bytes: 1, sha256: 'x'.repeat(64), purpose: 'APPROVAL_EVIDENCE',
    };
    const hasApprovalJobAccess = jest.fn().mockResolvedValue(true);
    const technicianWithApprovalsRead: AuthenticatedPrincipal = { ...uploader, permissions: ['approvals.read'] };
    const { service } = makeService({ repository: { findById: jest.fn().mockResolvedValue(row), hasApprovalJobAccess } });

    await expect(service.get(attachmentId, technicianWithApprovalsRead)).resolves.toMatchObject({ id: attachmentId });
    expect(hasApprovalJobAccess).toHaveBeenCalledWith('approval1', [scopeId]);
  });

  it('denies JOB_APPROVAL access to a jobs.read holder who lacks approvals.read (jobs.read alone is not enough)', async () => {
    const row = {
      id: attachmentId, uploaded_by: uploaderId, status: 'LINKED', owner_type: 'JOB_APPROVAL', owner_id: 'approval1',
      created_at: new Date(0), file_name: 'x.jpg', content_type: 'image/jpeg', size_bytes: 1, sha256: 'x'.repeat(64), purpose: 'APPROVAL_EVIDENCE',
    };
    const hasApprovalJobAccess = jest.fn().mockResolvedValue(true);
    const { service } = makeService({ repository: { findById: jest.fn().mockResolvedValue(row), hasApprovalJobAccess } });
    await expect(service.get(attachmentId, jobReader)).rejects.toMatchObject({ statusCode: 404 });
    expect(hasApprovalJobAccess).not.toHaveBeenCalled();
  });

  it('grants QUALITY_CHECK access via quality.perform even without jobs.read, restricted to the assigned job only when neither jobs.read nor quality.perform is held', async () => {
    const row = {
      id: attachmentId, uploaded_by: uploaderId, status: 'LINKED', owner_type: 'QUALITY_CHECK', owner_id: 'qc1',
      created_at: new Date(0), file_name: 'x.jpg', content_type: 'image/jpeg', size_bytes: 1, sha256: 'x'.repeat(64), purpose: 'QUALITY_EVIDENCE',
    };
    const hasQualityCheckJobAccess = jest.fn().mockResolvedValue(true);
    const qualityPerformerOnly: AuthenticatedPrincipal = { ...uploader, permissions: ['quality.perform'] };
    const { service, repository } = makeService({ repository: { findById: jest.fn().mockResolvedValue(row), hasQualityCheckJobAccess } });

    await expect(service.get(attachmentId, qualityPerformerOnly)).resolves.toMatchObject({ id: attachmentId });
    expect(hasQualityCheckJobAccess).toHaveBeenCalledWith('qc1', [scopeId], undefined);

    (repository.hasQualityCheckJobAccess as jest.Mock).mockClear();
    await expect(service.get(attachmentId, uploader)).resolves.toMatchObject({ id: attachmentId });
    expect((repository.hasQualityCheckJobAccess as jest.Mock).mock.calls[0]).toEqual(['qc1', [scopeId], uploaderId]);
  });

  it('grants ASSESSMENT access to training.read holders and to the owning student holding students.self', async () => {
    const row = {
      id: attachmentId, uploaded_by: uploaderId, status: 'LINKED', owner_type: 'ASSESSMENT', owner_id: 'assess1',
      created_at: new Date(0), file_name: 'x.jpg', content_type: 'image/jpeg', size_bytes: 1, sha256: 'x'.repeat(64), purpose: 'TRAINING_EVIDENCE',
    };
    const mentor: AuthenticatedPrincipal = { ...uploader, permissions: ['training.read'] };
    const student: AuthenticatedPrincipal = { ...uploader, id: otherUserId, permissions: ['students.self'] };

    const { service: mentorService } = makeService({ repository: { findById: jest.fn().mockResolvedValue(row) } });
    await expect(mentorService.get(attachmentId, mentor)).resolves.toMatchObject({ id: attachmentId });

    const { service: ownStudentService } = makeService({
      repository: { findById: jest.fn().mockResolvedValue(row), isOwnAssessment: jest.fn().mockResolvedValue(true) },
    });
    await expect(ownStudentService.get(attachmentId, student)).resolves.toMatchObject({ id: attachmentId });

    const { service: otherStudentService } = makeService({
      repository: { findById: jest.fn().mockResolvedValue(row), isOwnAssessment: jest.fn().mockResolvedValue(false) },
    });
    await expect(otherStudentService.get(attachmentId, student)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('denies ASSESSMENT access to an actor holding neither training.read nor students.self, without querying ownership', async () => {
    const row = {
      id: attachmentId, uploaded_by: uploaderId, status: 'LINKED', owner_type: 'ASSESSMENT', owner_id: 'assess1',
      created_at: new Date(0), file_name: 'x.jpg', content_type: 'image/jpeg', size_bytes: 1, sha256: 'x'.repeat(64), purpose: 'TRAINING_EVIDENCE',
    };
    const isOwnAssessment = jest.fn().mockResolvedValue(true);
    const { service } = makeService({ repository: { findById: jest.fn().mockResolvedValue(row), isOwnAssessment } });
    await expect(service.get(attachmentId, uploader)).rejects.toMatchObject({ statusCode: 404 });
    expect(isOwnAssessment).not.toHaveBeenCalled();
  });
});

describe('AttachmentsService.authorizeDownload / downloadByToken', () => {
  const unlinkedRow = {
    id: attachmentId, uploaded_by: uploaderId, status: 'UNLINKED', owner_type: null, owner_id: null,
    created_at: new Date(0), file_name: 'x.jpg', content_type: 'image/jpeg', size_bytes: 1, sha256: 'x'.repeat(64),
    purpose: 'JOB_PHOTO', object_storage_key: 'key1.jpg',
  };

  it('creates a <=5-minute authorization cryptographically bound to the caller, whose URL never contains the object storage key or attachment id', async () => {
    const { service, repository, audit } = makeService({ repository: { findById: jest.fn().mockResolvedValue(unlinkedRow) }, now: 1000 });
    const result = await service.authorizeDownload(attachmentId, uploader);
    expect(result.expiresAt.getTime() - 1000).toBe(5 * 60 * 1000);
    expect(result.url).not.toContain('key1.jpg');
    expect(result.url).not.toContain(attachmentId);
    expect(result.url).not.toContain(uploaderId);
    expect(result.url).toContain(authorizationId);
    const insertCalls = (repository.insertDownloadAuthorization as jest.Mock).mock.calls;
    expect(insertCalls[0]).toEqual([expect.anything(), { attachmentId, issuedTo: uploaderId, expiresAt: result.expiresAt }]);
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'ATTACHMENT.DOWNLOAD_AUTHORIZED' }));
    const auditedPayload = JSON.stringify(audit.mock.calls[0][1]);
    expect(auditedPayload).not.toContain(result.url);
    expect(auditedPayload).not.toContain('sig=');
  });

  it('issues a new, distinct authorization on every call', async () => {
    const insertDownloadAuthorization = jest.fn()
      .mockResolvedValueOnce({ id: authorizationId, expires_at: new Date(0) })
      .mockResolvedValueOnce({ id: otherUserId, expires_at: new Date(0) });
    const { service } = makeService({ repository: { findById: jest.fn().mockResolvedValue(unlinkedRow), insertDownloadAuthorization } });
    const first = await service.authorizeDownload(attachmentId, uploader);
    const second = await service.authorizeDownload(attachmentId, uploader);
    expect(first.url).not.toBe(second.url);
    expect(insertDownloadAuthorization).toHaveBeenCalledTimes(2);
  });

  it('denies authorizeDownload for an attachment the caller cannot read', async () => {
    const { service } = makeService({ repository: { findById: jest.fn().mockResolvedValue(unlinkedRow) } });
    await expect(service.authorizeDownload(attachmentId, otherUser)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('downloadByToken lets the correct caller download bytes and metadata only (no storage key)', async () => {
    const authorizationRow = {
      id: authorizationId, issued_to: uploaderId, expires_at: new Date(10_000),
      object_storage_key: 'key1.jpg', content_type: 'image/jpeg', file_name: 'x.jpg',
    };
    const storage = new TestAttachmentStorage();
    await storage.put('key1.jpg', Buffer.from('bytes'), 'image/jpeg');
    const { service } = makeService({ storage, repository: { findDownloadAuthorization: jest.fn().mockResolvedValue(authorizationRow) }, now: 1000 });
    const sig = signDownloadToken(authorizationId, uploaderId, 10_000, SIGNING_SECRET);
    const result = await service.downloadByToken(authorizationId, '10000', sig, uploader);
    expect(result).toEqual({ buffer: expect.any(Buffer), contentType: 'image/jpeg', fileName: 'x.jpg' });
    expect(result).not.toHaveProperty('objectStorageKey');
    expect(result).not.toHaveProperty('object_storage_key');
  });

  it('denies a different authenticated caller presenting the correct caller\'s URL (signature will not match their id)', async () => {
    const authorizationRow = {
      id: authorizationId, issued_to: uploaderId, expires_at: new Date(10_000),
      object_storage_key: 'key1.jpg', content_type: 'image/jpeg', file_name: 'x.jpg',
    };
    const { service } = makeService({ repository: { findDownloadAuthorization: jest.fn().mockResolvedValue(authorizationRow) }, now: 1000 });
    // The URL was signed for `uploader`; `otherUser` presents the exact same query string.
    const sigForUploader = signDownloadToken(authorizationId, uploaderId, 10_000, SIGNING_SECRET);
    await expect(service.downloadByToken(authorizationId, '10000', sigForUploader, otherUser)).resolves.toBeNull();
  });

  it('denies a different authenticated caller even if they somehow obtained a signature computed for their own id (issued_to mismatch)', async () => {
    // Defense in depth: even if a signature were forged/recomputed for otherUser's id, the DB
    // row's issued_to (bound to uploader) must still block access.
    const authorizationRow = {
      id: authorizationId, issued_to: uploaderId, expires_at: new Date(10_000),
      object_storage_key: 'key1.jpg', content_type: 'image/jpeg', file_name: 'x.jpg',
    };
    const { service } = makeService({ repository: { findDownloadAuthorization: jest.fn().mockResolvedValue(authorizationRow) }, now: 1000 });
    const sigForOtherUser = signDownloadToken(authorizationId, otherUserId, 10_000, SIGNING_SECRET);
    await expect(service.downloadByToken(authorizationId, '10000', sigForOtherUser, otherUser)).resolves.toBeNull();
  });

  it('downloadByToken rejects a wrong signature, a tampered expiry, a missing signature, and an expired signed token', async () => {
    const authorizationRow = {
      id: authorizationId, issued_to: uploaderId, expires_at: new Date(10_000),
      object_storage_key: 'key1.jpg', content_type: 'image/jpeg', file_name: 'x.jpg',
    };
    const { service, setNow } = makeService({ repository: { findDownloadAuthorization: jest.fn().mockResolvedValue(authorizationRow) }, now: 1000 });
    const validSig = signDownloadToken(authorizationId, uploaderId, 10_000, SIGNING_SECRET);

    await expect(service.downloadByToken(authorizationId, '10000', 'not-the-real-signature', uploader)).resolves.toBeNull();
    await expect(service.downloadByToken(authorizationId, '99999', validSig, uploader)).resolves.toBeNull();
    await expect(service.downloadByToken(authorizationId, '10000', undefined, uploader)).resolves.toBeNull();

    setNow(20_000);
    await expect(service.downloadByToken(authorizationId, '10000', validSig, uploader)).resolves.toBeNull();
  });

  it('downloadByToken rejects when the DB authorization has expired even if the signed param has not', async () => {
    const authorizationRow = {
      id: authorizationId, issued_to: uploaderId, expires_at: new Date(500),
      object_storage_key: 'key1.jpg', content_type: 'image/jpeg', file_name: 'x.jpg',
    };
    const { service } = makeService({ repository: { findDownloadAuthorization: jest.fn().mockResolvedValue(authorizationRow) }, now: 1000 });
    const sig = signDownloadToken(authorizationId, uploaderId, 10_000, SIGNING_SECRET);
    await expect(service.downloadByToken(authorizationId, '10000', sig, uploader)).resolves.toBeNull();
  });

  it('downloadByToken returns null for an authorization id that does not exist', async () => {
    const { service } = makeService({ repository: { findDownloadAuthorization: jest.fn().mockResolvedValue(null) } });
    const sig = signDownloadToken(authorizationId, uploaderId, 10_000, SIGNING_SECRET);
    await expect(service.downloadByToken(authorizationId, '10000', sig, uploader)).resolves.toBeNull();
  });
});

describe('AttachmentsService.linkToJob', () => {
  it('returns 404 when the job is out of scope or unassigned', async () => {
    const { service } = makeService();
    await expect(service.linkToJob(jobId, { attachmentIds: [attachmentId] }, uploader))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('locks the job before linking, and maps ATTACHMENT_NOT_LINKABLE to 409', async () => {
    const linkAttachments = jest.fn().mockRejectedValue(new Error('ATTACHMENT_NOT_LINKABLE'));
    const { service, jobsRepository } = makeService({
      jobsRepository: { findScoped: jest.fn().mockResolvedValue({ id: jobId }), linkAttachments },
    });
    await expect(service.linkToJob(jobId, { attachmentIds: [attachmentId] }, uploader))
      .rejects.toMatchObject({ code: ErrorCode.ATTACHMENT_NOT_LINKABLE, statusCode: 409 });
    expect((jobsRepository.findScoped as jest.Mock).mock.calls[0]).toEqual([jobId, [scopeId], expect.anything(), true, uploaderId]);
  });

  it('links atomically, audits, and returns the job attachment listing', async () => {
    const linkAttachments = jest.fn().mockResolvedValue(undefined);
    const listForJob = jest.fn().mockResolvedValue({ rows: [], totalItems: 0 });
    const { service, audit } = makeService({
      jobsRepository: { findScoped: jest.fn().mockResolvedValue({ id: jobId }), linkAttachments },
      repository: { listForJob },
    });
    const result = await service.linkToJob(jobId, { attachmentIds: [attachmentId] }, uploader);
    expect(result).toEqual({ items: [], page: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
    expect(linkAttachments).toHaveBeenCalledWith(expect.anything(), [attachmentId], uploaderId, jobId);
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'JOB_CARD.LINK_ATTACHMENTS' }));
  });
});

describe('AttachmentsService.listForJob', () => {
  it('rejects an unsupported sort field with 400', async () => {
    const { service } = makeService({
      jobsRepository: { findScoped: jest.fn().mockResolvedValue({ id: jobId }) },
      repository: { listForJob: jest.fn().mockRejectedValue(new Error('INVALID_SORT')) },
    });
    await expect(service.listForJob(jobId, { page: 1, pageSize: 20, sort: 'fileName' } as never, jobReader))
      .rejects.toMatchObject({ code: ErrorCode.BAD_REQUEST });
  });

  it('restricts assigned-only readers to their own job while jobs.read holders see any in-scope job', async () => {
    const findScoped = jest.fn().mockResolvedValue(null);
    const { service } = makeService({ jobsRepository: { findScoped } });
    await expect(service.listForJob(jobId, { page: 1, pageSize: 20 } as never, uploader))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(findScoped).toHaveBeenCalledWith(jobId, [scopeId], undefined, false, uploaderId);
  });
});

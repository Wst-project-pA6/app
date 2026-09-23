import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import { TestAttachmentStorage } from '../../common/storage/test-attachment-storage';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { ExportFormat, ExportType } from './dto/export.dto';
import { ExportRowsService } from './export-rows.service';
import { ExportJobRow, ExportsRepository, packFiltersColumn } from './exports.repository';
import { ExportsService } from './exports.service';

const scopeId = '22222222-2222-4222-8222-222222222222';
const jobId = '11111111-1111-4111-8111-111111111111';
const authorizationId = '44444444-4444-4444-8444-444444444444';
const requesterId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherUserId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SIGNING_SECRET = 'unit-test-signing-secret';
const NOW = Date.parse('2026-06-15T12:00:00.000Z');

const requester: AuthenticatedPrincipal = {
  id: requesterId, email: 'r@example.test', displayName: 'R', preferredLocale: 'en',
  roles: ['WORKSHOP_MANAGER'], permissions: ['exports.create', 'exports.read', 'jobs.read'],
  organizationScopeIds: [scopeId], mustChangePassword: false,
};

function baseJobRow(overrides: Partial<ExportJobRow> = {}): ExportJobRow {
  return {
    id: jobId,
    requested_by: requesterId,
    export_type: ExportType.JOBS,
    format: ExportFormat.CSV,
    status: 'PENDING',
    filters: JSON.parse(packFiltersColumn({})),
    filter_fingerprint: 'f'.repeat(64),
    sensitive: false,
    customer_id: null,
    row_count: null,
    object_storage_key: null,
    failure_message: null,
    completed_at: null,
    expires_at: null,
    created_at: new Date(NOW),
    updated_at: new Date(NOW),
    ...overrides,
  };
}

function makeService(overrides: {
  repository?: Partial<ExportsRepository>;
  rowsService?: Partial<ExportRowsService>;
  storage?: TestAttachmentStorage;
  now?: number;
  scheduler?: (work: () => void | Promise<void>) => void;
} = {}) {
  const storage = overrides.storage ?? new TestAttachmentStorage();
  const auditRecord = jest.fn().mockResolvedValue(undefined);
  const audit = { record: auditRecord } as unknown as AuditService;
  const client = {};
  const transaction = {
    runInTransaction: jest.fn(async (work: (value: unknown) => unknown) => work(client)),
  } as unknown as TransactionService;
  const configService = {
    get: jest.fn((key: string) => ({
      'attachments.signingSecret': SIGNING_SECRET,
      'app.baseUrl': 'http://localhost:3000',
      'exports.retentionMs': 24 * 60 * 60 * 1000,
    })[key]),
  };
  const repository = {
    insert: jest.fn().mockResolvedValue(baseJobRow()),
    findById: jest.fn().mockResolvedValue(null),
    list: jest.fn().mockResolvedValue({ rows: [], totalItems: 0 }),
    markProcessing: jest.fn().mockResolvedValue(undefined),
    markCompleted: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    markExpired: jest.fn().mockResolvedValue(undefined),
    customerAccessible: jest.fn().mockResolvedValue(true),
    insertDownloadAuthorization: jest.fn().mockResolvedValue({ id: authorizationId, expires_at: new Date(NOW) }),
    findDownloadAuthorization: jest.fn().mockResolvedValue(null),
    ...overrides.repository,
  } as unknown as ExportsRepository;
  const rowsService = {
    build: jest.fn().mockResolvedValue({
      headers: ['a'], rows: [['1']], rowCount: 1, totals: [{ key: 'ROW_COUNT', label: 'Row count', unit: 'COUNT', value: '1', recordCount: 1 }],
    }),
    ...overrides.rowsService,
  } as unknown as ExportRowsService;

  let now = overrides.now ?? NOW;
  const clock = () => now;
  const setNow = (value: number) => { now = value; };

  // Captures scheduled work WITHOUT running it — mirrors the real setImmediate deferral (the
  // request must return before processing starts). Tests that need processing to finish call
  // `runScheduled()` explicitly and await it.
  const scheduledWork: Array<() => void | Promise<void>> = [];
  const scheduler = overrides.scheduler ?? ((work: () => void | Promise<void>) => { scheduledWork.push(work); });
  const runScheduled = async () => { await Promise.all(scheduledWork.map((work) => Promise.resolve(work()))); };

  const service = new ExportsService(
    repository, rowsService, transaction, new ScopeService(), audit, configService as never, storage, clock, scheduler,
  );
  return { service, repository, rowsService, storage, audit: auditRecord, setNow, scheduledWork, runScheduled, transaction };
}

describe('ExportsService.create — validation and permission checks', () => {
  it('requires customerId for CUSTOMER_STATEMENT (422)', async () => {
    const { service } = makeService();
    await expect(
      service.create({ exportType: ExportType.CUSTOMER_STATEMENT, format: ExportFormat.CSV }, requester),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('rejects with 403 when the actor lacks the domain read permission required by the export type', async () => {
    const { service } = makeService();
    const actor = { ...requester, permissions: ['exports.create'] }; // no jobs.read
    await expect(service.create({ exportType: ExportType.JOBS, format: ExportFormat.CSV }, actor))
      .rejects.toMatchObject({ code: ErrorCode.FORBIDDEN });
  });

  it('returns 404 for a CUSTOMER_STATEMENT whose customer is outside the caller\'s scope', async () => {
    const { service, repository } = makeService({ repository: { customerAccessible: jest.fn().mockResolvedValue(false) } });
    const actor = { ...requester, permissions: ['exports.create', 'invoices.read'] };
    await expect(
      service.create({ exportType: ExportType.CUSTOMER_STATEMENT, format: ExportFormat.CSV, customerId: 'cust-1' }, actor),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    expect((repository.customerAccessible as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });
});

describe('ExportsService.create — lifecycle', () => {
  it('creates a PENDING job and returns it immediately, without waiting for processing', async () => {
    const { service, repository } = makeService();
    const result = await service.create({ exportType: ExportType.JOBS, format: ExportFormat.CSV }, requester);
    expect(result.status).toBe('PENDING');
    expect((repository.insert as jest.Mock).mock.calls).toHaveLength(1);
    expect((repository.markProcessing as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('drives PENDING -> PROCESSING -> COMPLETED once the scheduled work runs, generating a CSV buffer', async () => {
    const storage = new TestAttachmentStorage();
    const { service, repository, runScheduled } = makeService({ storage });
    await service.create({ exportType: ExportType.JOBS, format: ExportFormat.CSV }, requester);
    await runScheduled();

    expect((repository.markProcessing as jest.Mock).mock.calls[0]).toEqual([jobId]);
    expect((repository.markCompleted as jest.Mock).mock.calls).toHaveLength(1);
    const completedArgs = (repository.markCompleted as jest.Mock).mock.calls[0][1];
    expect(completedArgs.rowCount).toBe(1);
    expect(storage.objects.get(completedArgs.objectStorageKey)?.data.toString('utf8')).toContain('a\r\n1\r\n');
  });

  it('generates a PDF buffer (starting with the PDF header) when format is PDF', async () => {
    const storage = new TestAttachmentStorage();
    const { service, repository, runScheduled } = makeService({ storage });
    await service.create({ exportType: ExportType.JOBS, format: ExportFormat.PDF }, requester);
    await runScheduled();
    const completedArgs = (repository.markCompleted as jest.Mock).mock.calls[0][1];
    expect(storage.objects.get(completedArgs.objectStorageKey)?.data.toString('latin1')).toMatch(/^%PDF-1\.4/);
  });

  it('marks the job FAILED (never leaves it stuck PROCESSING) when row generation throws', async () => {
    const { service, repository, runScheduled } = makeService({
      rowsService: { build: jest.fn().mockRejectedValue(new Error('boom')) },
    });
    await service.create({ exportType: ExportType.JOBS, format: ExportFormat.CSV }, requester);
    await runScheduled();
    expect((repository.markFailed as jest.Mock).mock.calls[0]).toEqual([jobId, 'boom']);
    expect((repository.markCompleted as jest.Mock).mock.calls).toHaveLength(0);
  });

  it('audits EXPORT.CREATE only for sensitive export types, not for JOBS', async () => {
    const { service, audit } = makeService();
    await service.create({ exportType: ExportType.JOBS, format: ExportFormat.CSV }, requester);
    expect(audit).not.toHaveBeenCalled();
  });

  it('audits EXPORT.CREATE for a sensitive export type (e.g. INVOICES)', async () => {
    const { service, audit } = makeService({
      repository: { insert: jest.fn().mockResolvedValue(baseJobRow({ export_type: ExportType.INVOICES, sensitive: true })) },
    });
    const actor = { ...requester, permissions: ['exports.create', 'invoices.read'] };
    await service.create({ exportType: ExportType.INVOICES, format: ExportFormat.CSV }, actor);
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'EXPORT.CREATE' }));
  });

  it('rolls back: an error inside the transaction (e.g. the INSERT failing) propagates and never schedules processing', async () => {
    const { service, repository, scheduledWork } = makeService({
      repository: { insert: jest.fn().mockRejectedValue(new Error('insert failed')) },
    });
    await expect(service.create({ exportType: ExportType.JOBS, format: ExportFormat.CSV }, requester)).rejects.toThrow('insert failed');
    expect(scheduledWork).toHaveLength(0);
    expect((repository.markProcessing as jest.Mock).mock.calls).toHaveLength(0);
  });
});

describe('ExportsService.list / get — ownership', () => {
  it('get() returns 404 for a job owned by someone else (never distinguishing from "does not exist")', async () => {
    const { service } = makeService({ repository: { findById: jest.fn().mockResolvedValue(baseJobRow({ requested_by: otherUserId })) } });
    await expect(service.get(jobId, requester)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('get() returns the job when the caller is its requester', async () => {
    const { service } = makeService({ repository: { findById: jest.fn().mockResolvedValue(baseJobRow()) } });
    await expect(service.get(jobId, requester)).resolves.toMatchObject({ id: jobId });
  });

  it('list() scopes to the caller\'s own jobs via requestedBy, never a global listing', async () => {
    const { service, repository } = makeService();
    await service.list({ page: 1, pageSize: 20 }, requester);
    expect((repository.list as jest.Mock).mock.calls[0]).toEqual([requesterId, { page: 1, pageSize: 20 }]);
  });
});

describe('ExportsService.authorizeDownload — readiness and expiry', () => {
  it('rejects with 409 EXPORT_NOT_READY when the job has not completed', async () => {
    const { service } = makeService({ repository: { findById: jest.fn().mockResolvedValue(baseJobRow({ status: 'PENDING' })) } });
    await expect(service.authorizeDownload(jobId, requester)).rejects.toMatchObject({ code: ErrorCode.EXPORT_NOT_READY });
  });

  it('rejects with 409 EXPORT_EXPIRED for a job already marked EXPIRED', async () => {
    const { service } = makeService({ repository: { findById: jest.fn().mockResolvedValue(baseJobRow({ status: 'EXPIRED' })) } });
    await expect(service.authorizeDownload(jobId, requester)).rejects.toMatchObject({ code: ErrorCode.EXPORT_EXPIRED });
  });

  it('lazily expires (and rejects) a COMPLETED job whose expiresAt has passed', async () => {
    const { service, repository } = makeService({
      repository: {
        findById: jest.fn().mockResolvedValue(baseJobRow({ status: 'COMPLETED', expires_at: new Date(NOW - 1000) })),
      },
    });
    await expect(service.authorizeDownload(jobId, requester)).rejects.toMatchObject({ code: ErrorCode.EXPORT_EXPIRED });
    expect((repository.markExpired as jest.Mock).mock.calls[0]).toEqual([jobId]);
  });

  it('returns 404 for a completed job owned by someone else', async () => {
    const { service } = makeService({
      repository: { findById: jest.fn().mockResolvedValue(baseJobRow({ status: 'COMPLETED', requested_by: otherUserId, expires_at: new Date(NOW + 60000) })) },
    });
    await expect(service.authorizeDownload(jobId, requester)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('issues a signed URL that expires 5 minutes from now for a COMPLETED, unexpired job', async () => {
    const { service, audit } = makeService({
      repository: { findById: jest.fn().mockResolvedValue(baseJobRow({ status: 'COMPLETED', expires_at: new Date(NOW + 60 * 60 * 1000) })) },
    });
    const result = await service.authorizeDownload(jobId, requester);
    expect(result.expiresAt).toBe(new Date(NOW + 5 * 60 * 1000).toISOString());
    expect(result.url).toContain('/api/v1/exports/downloads/');
    expect(audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'EXPORT.DOWNLOAD_AUTHORIZED' }));
  });
});

describe('ExportsService.downloadByToken', () => {
  async function authorizedUrl(overrides: Partial<ExportJobRow> = {}) {
    const storage = new TestAttachmentStorage();
    await storage.put('key1.csv', Buffer.from('a,b\r\n1,2\r\n'), 'text/csv');
    const made = makeService({
      storage,
      repository: {
        findById: jest.fn().mockResolvedValue(baseJobRow({ status: 'COMPLETED', expires_at: new Date(NOW + 60 * 60 * 1000), ...overrides })),
        findDownloadAuthorization: jest.fn().mockResolvedValue({
          id: authorizationId, issued_to: requesterId, expires_at: new Date(NOW + 5 * 60 * 1000),
          object_storage_key: 'key1.csv', export_type: 'JOBS', format: 'CSV',
        }),
      },
    });
    const authorization = await made.service.authorizeDownload(jobId, requester);
    const url = new URL(authorization.url);
    return { service: made.service, url, setNow: made.setNow };
  }

  it('serves the file for a valid, unexpired token issued to the caller', async () => {
    const { service, url } = await authorizedUrl();
    const result = await service.downloadByToken(authorizationId, url.searchParams.get('expires')!, url.searchParams.get('sig')!, requester);
    expect(result).not.toBeNull();
    expect(result!.buffer.toString('utf8')).toBe('a,b\r\n1,2\r\n');
    expect(result!.contentType).toBe('text/csv; charset=utf-8');
  });

  it('returns null for a tampered signature', async () => {
    const { service, url } = await authorizedUrl();
    const result = await service.downloadByToken(authorizationId, url.searchParams.get('expires')!, 'tampered-signature', requester);
    expect(result).toBeNull();
  });

  it('returns null when a different authenticated user presents someone else\'s URL', async () => {
    const { service, url } = await authorizedUrl();
    const otherActor = { ...requester, id: otherUserId };
    const result = await service.downloadByToken(authorizationId, url.searchParams.get('expires')!, url.searchParams.get('sig')!, otherActor);
    expect(result).toBeNull();
  });

  it('returns null once the signed expiry timestamp has passed, even with a valid signature', async () => {
    const { service, url, setNow } = await authorizedUrl();
    setNow(NOW + 6 * 60 * 1000); // 6 minutes later — past the 5-minute download-authorization TTL
    const result = await service.downloadByToken(authorizationId, url.searchParams.get('expires')!, url.searchParams.get('sig')!, requester);
    expect(result).toBeNull();
  });
});

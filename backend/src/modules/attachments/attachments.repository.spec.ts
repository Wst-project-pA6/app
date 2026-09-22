import { DatabaseService } from '../../common/database/database.service';
import { AttachmentsRepository } from './attachments.repository';

describe('AttachmentsRepository', () => {
  it('inserts an UNLINKED attachment row with parameterized values', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'att1' }] }) };
    const repository = new AttachmentsRepository({} as DatabaseService);
    const row = await repository.insert(client as never, {
      uploadedBy: 'user1', fileName: 'photo.jpg', contentType: 'image/jpeg', sizeBytes: 10,
      sha256: 'a'.repeat(64), objectStorageKey: 'key1.jpg', purpose: 'JOB_PHOTO',
    });
    expect(row).toEqual({ id: 'att1' });
    expect(client.query.mock.calls[0][0]).toContain('INSERT INTO attachments');
    expect(client.query.mock.calls[0][0]).toContain("'UNLINKED'");
    expect(client.query.mock.calls[0][1]).toEqual(['user1', 'photo.jpg', 'image/jpeg', 10, 'a'.repeat(64), 'key1.jpg', 'JOB_PHOTO']);
  });

  it('findById queries via the injected client when given, or the pool otherwise', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'att1' }] }) };
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new AttachmentsRepository(db as unknown as DatabaseService);
    await expect(repository.findById('att1', client as never)).resolves.toEqual({ id: 'att1' });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FROM attachments'), ['att1']);
    await expect(repository.findById('att2')).resolves.toBeNull();
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('FROM attachments'), ['att2']);
  });

  it.each([
    ['hasJobAccess', 'job_cards j'],
    ['hasApprovalJobAccess', 'job_approvals ja'],
    ['hasQualityCheckJobAccess', 'quality_checks q'],
  ] as const)('%s scopes by organization and, when given, the assigned technician', async (method, fromClause) => {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 1 }) };
    const repository = new AttachmentsRepository(db as unknown as DatabaseService);
    await expect(repository[method]('id1', ['scope1'], 'tech1')).resolves.toBe(true);
    expect(db.query.mock.calls[0][0]).toContain(fromClause);
    expect(db.query.mock.calls[0][0]).toContain('technician_id = $3');
    expect(db.query.mock.calls[0][1]).toEqual(['id1', ['scope1'], 'tech1']);

    db.query.mockResolvedValue({ rowCount: 0 });
    await expect(repository[method]('id1', ['scope1'])).resolves.toBe(false);
    expect(db.query.mock.calls[1][0]).not.toContain('technician_id');
    expect(db.query.mock.calls[1][1]).toEqual(['id1', ['scope1']]);
  });

  it('isOwnAssessment checks the student owns the user account', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rowCount: 1 }) };
    const repository = new AttachmentsRepository(db as unknown as DatabaseService);
    await expect(repository.isOwnAssessment('assess1', 'user1')).resolves.toBe(true);
    expect(db.query.mock.calls[0][1]).toEqual(['assess1', 'user1']);
  });

  it('inserts a download authorization row bound to the caller', async () => {
    const expiresAt = new Date('2026-01-01T00:05:00Z');
    const client = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'auth1', expires_at: expiresAt }] }) };
    const repository = new AttachmentsRepository({} as DatabaseService);
    const row = await repository.insertDownloadAuthorization(client as never, {
      attachmentId: 'att1', issuedTo: 'user1', expiresAt,
    });
    expect(row).toEqual({ id: 'auth1', expires_at: expiresAt });
    expect(client.query.mock.calls[0][1]).toEqual(['att1', 'user1', expiresAt]);
  });

  it('findDownloadAuthorization joins to the attachment metadata and includes issued_to for the caller-binding check', async () => {
    const expiresAt = new Date('2026-01-01T00:05:00Z');
    const row = { id: 'auth1', issued_to: 'user1', expires_at: expiresAt, object_storage_key: 'key1.jpg', content_type: 'image/jpeg', file_name: 'x.jpg' };
    const db = { query: jest.fn().mockResolvedValue({ rows: [row] }) };
    const repository = new AttachmentsRepository(db as unknown as DatabaseService);
    await expect(repository.findDownloadAuthorization('auth1')).resolves.toEqual(row);
    expect(db.query.mock.calls[0][0]).toContain('da.issued_to');
    expect(db.query.mock.calls[0][1]).toEqual(['auth1']);

    db.query.mockResolvedValue({ rows: [] });
    await expect(repository.findDownloadAuthorization('missing')).resolves.toBeNull();
  });

  it('listForJob paginates, sorts by createdAt only, and rejects other sort fields', async () => {
    const queryValue = jest.fn().mockResolvedValue(2);
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new AttachmentsRepository({ queryValue, query } as unknown as DatabaseService);
    await repository.listForJob('job1', { page: 1, pageSize: 20, sort: '-createdAt' });
    expect(query.mock.calls[0][0]).toContain('a.created_at DESC');
    await expect(repository.listForJob('job1', { page: 1, pageSize: 20, sort: 'fileName' })).rejects.toThrow('INVALID_SORT');
  });
});

import { DatabaseService } from '../../common/database/database.service';
import { CertificatesRepository } from './certificates.repository';

const certificateId = '11111111-1111-4111-8111-111111111111';
const studentId = '22222222-2222-4222-8222-222222222222';
const courseId = '33333333-3333-4333-8333-333333333333';
const enrollmentId = '44444444-4444-4444-8444-444444444444';
const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const tokenHash = 'b'.repeat(64);

describe('CertificatesRepository', () => {
  it('generates the certificate number from the authoritative database sequence and never accepts one', async () => {
    const client = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: certificateId }] })
        .mockResolvedValueOnce({ rows: [{ id: certificateId, certificate_number: 'CERT-2026-000001' }] }),
    };
    const repository = new CertificatesRepository({} as DatabaseService);
    await repository.create(client as never, { studentId, courseId, enrollmentId, issuedBy: actor, tokenHash });
    expect(client.query.mock.calls[0][0]).toContain("nextval('certificate_number_seq')");
    expect(client.query.mock.calls[0][0]).toContain("'CERT-' || to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY')");
    expect(client.query.mock.calls[0][1]).not.toContain('CERT-2026-000001');
    expect(client.query.mock.calls[0][1]).toEqual([studentId, courseId, enrollmentId, actor, tokenHash, null]);
  });

  it('serializes concurrent same-key issuance with a two-key advisory lock, namespaced separately from other modules', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new CertificatesRepository({} as DatabaseService);
    await repository.acquireIdempotencyLock(client as never, 'certificate', 'a-valid-key-123');
    expect(client.query.mock.calls[0][0]).toBe('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))');
    expect(client.query.mock.calls[0][1]).toEqual(['certificate', 'a-valid-key-123']);
  });

  it('scopes findScoped through the course organization and locks only when asked', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const repository = new CertificatesRepository({} as DatabaseService);
    await repository.findScoped(certificateId, ['scope-1'], client as never, true);
    expect(client.query.mock.calls[0][0]).toContain('c.organization_scope_id = ANY($2::uuid[])');
    expect(client.query.mock.calls[0][0]).toContain('FOR UPDATE OF cert');
  });

  it('revokes only a currently-ISSUED certificate, guarding the WHERE clause as defense-in-depth', async () => {
    const client = { query: jest.fn().mockResolvedValueOnce({ rowCount: 1, rows: [{ id: certificateId }] }).mockResolvedValueOnce({ rows: [{ id: certificateId }] }) };
    const repository = new CertificatesRepository({} as DatabaseService);
    await repository.revoke(client as never, certificateId, actor, 'Fraudulent submission');
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain("status = 'REVOKED'");
    expect(sql).toContain("WHERE id = $3 AND status = 'ISSUED'");
    expect(params).toEqual([actor, 'Fraudulent submission', certificateId]);

    const alreadyRevoked = { query: jest.fn().mockResolvedValueOnce({ rowCount: 0, rows: [] }) };
    await expect(repository.revoke(alreadyRevoked as never, certificateId, actor, 'again')).resolves.toBeNull();
  });

  it('looks up public verification by hashed token only and selects exactly the safe public fields', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ certificate_number: 'CERT-2026-000001' }] });
    const repository = new CertificatesRepository({ query } as unknown as DatabaseService);
    await repository.findByTokenHash(tokenHash);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('cert.verification_token_hash = $1');
    expect(sql).toContain('cert.certificate_number');
    expect(sql).toContain('u.display_name AS holder_display_name');
    expect(sql).toContain('co.name_en AS course_name_en');
    // Never selects internal ids, grades, or results — only the join conditions may reference them.
    const selectClause = sql.slice(sql.indexOf('SELECT'), sql.indexOf('FROM certificates'));
    expect(selectClause).not.toMatch(/\bcert\.id\b/);
    expect(selectClause).not.toMatch(/\bcert\.student_id\b/);
    expect(selectClause).not.toMatch(/\bcert\.course_id\b/);
    expect(selectClause).not.toMatch(/\bcert\.enrollment_id\b/);
    expect(params).toEqual([tokenHash]);
  });

  it('uses parameterized list filters with a deterministic default sort and no raw filter text in SQL', async () => {
    const queryValue = jest.fn().mockResolvedValue(1);
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new CertificatesRepository({ queryValue, query } as unknown as DatabaseService);
    await repository.list({ page: 1, pageSize: 20, courseId, status: 'ISSUED' } as never, ['scope-1'], { studentId });
    expect(query.mock.calls[0][0]).toContain('cert.issued_at DESC');
    expect(query.mock.calls[0][1]).toEqual([['scope-1'], courseId, 'ISSUED', studentId, 20, 0]);
    await expect(repository.list({ page: 1, pageSize: 20, sort: 'status' } as never, [])).rejects.toThrow('INVALID_SORT');
  });
});

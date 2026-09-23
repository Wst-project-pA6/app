import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { CertificateListQuery } from './dto/certificate.dto';

export interface CertificateRow {
  id: string;
  certificate_number: string;
  student_id: string;
  course_id: string;
  enrollment_id: string;
  issued_at: Date;
  issued_by: string;
  status: 'ISSUED' | 'REVOKED';
  revoked_at: Date | null;
  revoked_by: string | null;
  revocation_reason: string | null;
  idempotency_key: string | null;
  created_at: Date;
}

/** Only the fields the frozen PublicCertificateVerification schema allows — never an id, student id, or course id. */
export interface PublicCertificateRow {
  certificate_number: string;
  status: 'ISSUED' | 'REVOKED';
  holder_display_name: string;
  course_name_en: string;
  course_name_ar: string | null;
  issued_at: Date;
  revoked_at: Date | null;
}

const CERTIFICATE_SELECT = `
  cert.id, cert.certificate_number, cert.student_id, cert.course_id, cert.enrollment_id,
  cert.issued_at, cert.issued_by, cert.status, cert.revoked_at, cert.revoked_by,
  cert.revocation_reason, cert.idempotency_key, cert.created_at`;

const SORT_FIELDS: Record<string, string> = {
  issuedAt: 'cert.issued_at',
  certificateNumber: 'cert.certificate_number',
};

function orderBy(sort?: string): string {
  const requested = sort?.split(',') ?? ['-issuedAt'];
  return requested
    .map((part) => {
      const descending = part.startsWith('-');
      const field = SORT_FIELDS[descending ? part.slice(1) : part];
      if (!field) throw new Error('INVALID_SORT');
      return `${field} ${descending ? 'DESC' : 'ASC'}`;
    })
    .join(', ');
}

@Injectable()
export class CertificatesRepository {
  constructor(private readonly db: DatabaseService) {}

  async acquireIdempotencyLock(client: PoolClient, namespace: string, key: string): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [namespace, key]);
  }

  async findByIdempotencyKey(client: PoolClient, idempotencyKey: string): Promise<CertificateRow | null> {
    const result = await client.query<CertificateRow>(
      `SELECT ${CERTIFICATE_SELECT} FROM certificates cert WHERE cert.idempotency_key = $1`,
      [idempotencyKey],
    );
    return result.rows[0] ?? null;
  }

  async findScoped(
    certificateId: string,
    scopeIds: string[],
    client?: PoolClient,
    lock = false,
  ): Promise<CertificateRow | null> {
    const sql = `SELECT ${CERTIFICATE_SELECT} FROM certificates cert
      JOIN courses c ON c.id = cert.course_id AND c.organization_scope_id = ANY($2::uuid[])
      WHERE cert.id = $1${lock ? ' FOR UPDATE OF cert' : ''}`;
    const result = client
      ? await client.query<CertificateRow>(sql, [certificateId, scopeIds])
      : await this.db.query<CertificateRow>(sql, [certificateId, scopeIds]);
    return result.rows[0] ?? null;
  }

  async findById(client: PoolClient, certificateId: string): Promise<CertificateRow | null> {
    const result = await client.query<CertificateRow>(
      `SELECT ${CERTIFICATE_SELECT} FROM certificates cert WHERE cert.id = $1`,
      [certificateId],
    );
    return result.rows[0] ?? null;
  }

  async create(
    client: PoolClient,
    data: {
      studentId: string;
      courseId: string;
      enrollmentId: string;
      issuedBy: string;
      tokenHash: string;
      idempotencyKey?: string;
    },
  ): Promise<CertificateRow> {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO certificates
       (certificate_number, student_id, course_id, enrollment_id, issued_by, verification_token_hash, idempotency_key)
       VALUES (
         'CERT-' || to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY') || '-' || lpad(nextval('certificate_number_seq')::text, 6, '0'),
         $1, $2, $3, $4, $5, $6
       )
       RETURNING id`,
      [data.studentId, data.courseId, data.enrollmentId, data.issuedBy, data.tokenHash, data.idempotencyKey ?? null],
    );
    const row = await this.findById(client, inserted.rows[0].id);
    if (!row) throw new Error('Created certificate could not be read');
    return row;
  }

  async revoke(client: PoolClient, certificateId: string, actor: string, reason: string): Promise<CertificateRow | null> {
    const result = await client.query<{ id: string }>(
      `UPDATE certificates
       SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP, revoked_by = $1, revocation_reason = $2
       WHERE id = $3 AND status = 'ISSUED'
       RETURNING id`,
      [actor, reason, certificateId],
    );
    if (result.rowCount !== 1) return null;
    return this.findById(client, certificateId);
  }

  /**
   * Public verification lookup: hashes the presented token first (see certificate-token.util.ts)
   * and looks up an equality match on the unique, indexed verification_token_hash column — never
   * a plaintext comparison. The SELECT list itself is the security boundary: it can only ever
   * return the exact fields the frozen PublicCertificateVerification schema allows.
   */
  async findByTokenHash(tokenHash: string): Promise<PublicCertificateRow | null> {
    const result = await this.db.query<PublicCertificateRow>(
      `SELECT cert.certificate_number, cert.status, cert.issued_at, cert.revoked_at,
              u.display_name AS holder_display_name,
              co.name_en AS course_name_en, co.name_ar AS course_name_ar
       FROM certificates cert
       JOIN students s ON s.id = cert.student_id
       JOIN users u ON u.id = s.user_id
       JOIN courses co ON co.id = cert.course_id
       WHERE cert.verification_token_hash = $1`,
      [tokenHash],
    );
    return result.rows[0] ?? null;
  }

  async list(
    query: CertificateListQuery,
    scopeIds: string[],
    restrict?: { studentId?: string },
  ): Promise<{ rows: CertificateRow[]; totalItems: number }> {
    const where = ['c.organization_scope_id = ANY($1::uuid[])'];
    const params: unknown[] = [scopeIds];
    if (query.studentId) {
      params.push(query.studentId);
      where.push(`cert.student_id = $${params.length}`);
    }
    if (query.courseId) {
      params.push(query.courseId);
      where.push(`cert.course_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`cert.status = $${params.length}`);
    }
    if (restrict?.studentId) {
      params.push(restrict.studentId);
      where.push(`cert.student_id = $${params.length}`);
    }
    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM certificates cert
       JOIN courses c ON c.id = cert.course_id ${condition}`,
      params,
    );
    const rows = await this.db.query<CertificateRow>(
      `SELECT ${CERTIFICATE_SELECT} FROM certificates cert
       JOIN courses c ON c.id = cert.course_id ${condition}
       ORDER BY ${orderBy(query.sort)}, cert.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}

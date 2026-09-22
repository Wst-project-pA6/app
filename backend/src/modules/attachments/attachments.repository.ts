import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';

export interface AttachmentRow {
  id: string;
  uploaded_by: string;
  file_name: string;
  content_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
  size_bytes: number;
  sha256: string;
  object_storage_key: string;
  purpose: 'JOB_PHOTO' | 'APPROVAL_EVIDENCE' | 'QUALITY_EVIDENCE' | 'TRAINING_EVIDENCE';
  status: 'UNLINKED' | 'LINKED' | 'EXPIRED';
  owner_type: 'JOB_CARD' | 'JOB_APPROVAL' | 'QUALITY_CHECK' | 'ASSESSMENT' | null;
  owner_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface DownloadAuthorizationRow {
  id: string;
  expires_at: Date;
}

export interface DownloadAuthorizationDetailRow {
  id: string;
  issued_to: string;
  expires_at: Date;
  object_storage_key: string;
  content_type: string;
  file_name: string;
}

const ATTACHMENT_SELECT = `
  id, uploaded_by, file_name, content_type, size_bytes, sha256, object_storage_key,
  purpose, status, owner_type, owner_id, created_at, updated_at`;

const JOB_ATTACHMENT_SELECT = `
  a.id, a.uploaded_by, a.file_name, a.content_type, a.size_bytes, a.sha256, a.object_storage_key,
  a.purpose, a.status, a.owner_type, a.owner_id, a.created_at, a.updated_at`;

@Injectable()
export class AttachmentsRepository {
  constructor(private readonly db: DatabaseService) {}

  async insert(
    client: PoolClient,
    data: {
      uploadedBy: string;
      fileName: string;
      contentType: string;
      sizeBytes: number;
      sha256: string;
      objectStorageKey: string;
      purpose: string;
    },
  ): Promise<AttachmentRow> {
    const result = await client.query<AttachmentRow>(
      `INSERT INTO attachments (uploaded_by, file_name, content_type, size_bytes, sha256, object_storage_key, purpose, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'UNLINKED')
       RETURNING ${ATTACHMENT_SELECT}`,
      [data.uploadedBy, data.fileName, data.contentType, data.sizeBytes, data.sha256, data.objectStorageKey, data.purpose],
    );
    return result.rows[0];
  }

  async findById(attachmentId: string, client?: PoolClient): Promise<AttachmentRow | null> {
    const sql = `SELECT ${ATTACHMENT_SELECT} FROM attachments WHERE id = $1`;
    const result = client
      ? await client.query<AttachmentRow>(sql, [attachmentId])
      : await this.db.query<AttachmentRow>(sql, [attachmentId]);
    return result.rows[0] ?? null;
  }

  /** True when the given job is within scopeIds and (if assignedTechnicianId is set) assigned to that technician. */
  async hasJobAccess(jobId: string, scopeIds: string[], assignedTechnicianId?: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM job_cards j
       JOIN organization_scopes os ON os.id = j.organization_scope_id AND os.status = 'ACTIVE'
       WHERE j.id = $1 AND j.organization_scope_id = ANY($2::uuid[])
         ${assignedTechnicianId ? 'AND j.technician_id = $3' : ''}`,
      assignedTechnicianId ? [jobId, scopeIds, assignedTechnicianId] : [jobId, scopeIds],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async hasApprovalJobAccess(approvalId: string, scopeIds: string[], assignedTechnicianId?: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM job_approvals ja
       JOIN job_cards j ON j.id = ja.job_id
       JOIN organization_scopes os ON os.id = j.organization_scope_id AND os.status = 'ACTIVE'
       WHERE ja.id = $1 AND j.organization_scope_id = ANY($2::uuid[])
         ${assignedTechnicianId ? 'AND j.technician_id = $3' : ''}`,
      assignedTechnicianId ? [approvalId, scopeIds, assignedTechnicianId] : [approvalId, scopeIds],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async hasQualityCheckJobAccess(qualityCheckId: string, scopeIds: string[], assignedTechnicianId?: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM quality_checks q
       JOIN job_cards j ON j.id = q.job_id
       JOIN organization_scopes os ON os.id = j.organization_scope_id AND os.status = 'ACTIVE'
       WHERE q.id = $1 AND j.organization_scope_id = ANY($2::uuid[])
         ${assignedTechnicianId ? 'AND j.technician_id = $3' : ''}`,
      assignedTechnicianId ? [qualityCheckId, scopeIds, assignedTechnicianId] : [qualityCheckId, scopeIds],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** True when actorUserId is the student the assessment belongs to. */
  async isOwnAssessment(assessmentId: string, actorUserId: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT 1 FROM assessments a
       JOIN students s ON s.id = a.student_id
       WHERE a.id = $1 AND s.user_id = $2`,
      [assessmentId, actorUserId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async insertDownloadAuthorization(
    client: PoolClient,
    data: { attachmentId: string; issuedTo: string; expiresAt: Date },
  ): Promise<DownloadAuthorizationRow> {
    const result = await client.query<DownloadAuthorizationRow>(
      `INSERT INTO download_authorizations (attachment_id, issued_to, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, expires_at`,
      [data.attachmentId, data.issuedTo, data.expiresAt],
    );
    return result.rows[0];
  }

  /**
   * Looks up a download authorization by its own id, joined to the file metadata needed to
   * serve it. Includes issued_to so the caller-binding check has an authoritative,
   * independently-checked value to compare against (in addition to the signature already
   * binding the same value cryptographically) — never returned to any HTTP response body.
   */
  async findDownloadAuthorization(authorizationId: string): Promise<DownloadAuthorizationDetailRow | null> {
    const result = await this.db.query<DownloadAuthorizationDetailRow>(
      `SELECT da.id, da.issued_to, da.expires_at, a.object_storage_key, a.content_type, a.file_name
       FROM download_authorizations da
       JOIN attachments a ON a.id = da.attachment_id
       WHERE da.id = $1`,
      [authorizationId],
    );
    return result.rows[0] ?? null;
  }

  async listForJob(jobId: string, query: { page: number; pageSize: number; sort?: string }) {
    if (query.sort) {
      for (const part of query.sort.split(',')) {
        if ((part.startsWith('-') ? part.slice(1) : part) !== 'createdAt') throw new Error('INVALID_SORT');
      }
    }
    const direction = query.sort?.startsWith('-') ? 'DESC' : 'ASC';
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM job_card_attachments jca WHERE jca.job_id = $1`,
      [jobId],
    );
    const rows = await this.db.query<AttachmentRow>(
      `SELECT ${JOB_ATTACHMENT_SELECT} FROM attachments a
       JOIN job_card_attachments jca ON jca.attachment_id = a.id
       WHERE jca.job_id = $1
       ORDER BY a.created_at ${direction}, a.id ASC
       LIMIT $2 OFFSET $3`,
      [jobId, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}

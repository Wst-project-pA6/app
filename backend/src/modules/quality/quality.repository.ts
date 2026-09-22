import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { QualityCheckListQuery } from './dto/quality-check.dto';

export interface QualityCheckRow {
  id: string;
  job_id: string;
  result: 'PASSED' | 'FAILED';
  notes: string | null;
  performed_by: string;
  performed_at: Date;
  evidence_attachment_ids: string[];
}

const QUALITY_CHECK_SELECT = `
  q.id, q.job_id, q.result, q.notes, q.performed_by, q.performed_at,
  COALESCE((SELECT array_agg(attachment_id ORDER BY attachment_id) FROM quality_check_evidence_attachments WHERE quality_check_id = q.id),
           ARRAY[]::uuid[]) AS evidence_attachment_ids`;

@Injectable()
export class QualityRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(
    client: PoolClient,
    data: { jobId: string; result: string; notes?: string; actor: string },
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO quality_checks (job_id, result, notes, performed_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [data.jobId, data.result, data.notes ?? null, data.actor],
    );
    return result.rows[0].id;
  }

  async linkEvidenceAttachments(client: PoolClient, qualityCheckId: string, attachmentIds: string[], actor: string): Promise<void> {
    if (attachmentIds.length === 0) return;
    const orderedIds = [...attachmentIds].sort();
    const result = await client.query<{ id: string }>(
      `SELECT id FROM attachments
       WHERE id = ANY($1::uuid[]) AND uploaded_by = $2 AND status = 'UNLINKED' AND purpose = 'QUALITY_EVIDENCE'
         AND created_at > now() - interval '24 hours'
       ORDER BY id
       FOR UPDATE`,
      [orderedIds, actor],
    );
    if (result.rowCount !== attachmentIds.length) throw new Error('ATTACHMENT_NOT_LINKABLE');
    await client.query(
      `UPDATE attachments SET status = 'LINKED', owner_type = 'QUALITY_CHECK', owner_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($2::uuid[])`,
      [qualityCheckId, attachmentIds],
    );
    await client.query(
      `INSERT INTO quality_check_evidence_attachments (quality_check_id, attachment_id)
       SELECT $1, unnest($2::uuid[])`,
      [qualityCheckId, attachmentIds],
    );
  }

  async findById(client: PoolClient, qualityCheckId: string): Promise<QualityCheckRow | null> {
    const result = await client.query<QualityCheckRow>(
      `SELECT ${QUALITY_CHECK_SELECT} FROM quality_checks q WHERE q.id = $1`,
      [qualityCheckId],
    );
    return result.rows[0] ?? null;
  }

  async list(jobId: string, query: QualityCheckListQuery) {
    if (query.sort) {
      for (const part of query.sort.split(',')) {
        if ((part.startsWith('-') ? part.slice(1) : part) !== 'performedAt') throw new Error('INVALID_SORT');
      }
    }
    const direction = query.sort?.startsWith('-') ? 'DESC' : 'ASC';
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM quality_checks WHERE job_id = $1`,
      [jobId],
    );
    const rows = await this.db.query<QualityCheckRow>(
      `SELECT ${QUALITY_CHECK_SELECT} FROM quality_checks q WHERE q.job_id = $1
       ORDER BY q.performed_at ${direction}, q.id ASC
       LIMIT $2 OFFSET $3`,
      [jobId, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}

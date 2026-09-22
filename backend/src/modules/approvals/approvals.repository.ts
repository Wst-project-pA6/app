import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import { JobApprovalListQuery } from './dto/approval.dto';

export interface JobApprovalRow {
  id: string;
  job_id: string;
  scope: 'INITIAL_WORK' | 'ADDITIONAL_WORK' | 'SUBLET';
  description: string;
  estimated_amount: string | null;
  estimated_currency_code: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  method: string | null;
  approved_by_name: string | null;
  decided_at: Date | null;
  recorded_by: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  work_item_ids: string[];
  evidence_attachment_ids: string[];
}

const APPROVAL_SELECT = `
  a.id, a.job_id, a.scope, a.description, a.estimated_amount, a.estimated_currency_code,
  a.status, a.method, a.approved_by_name, a.decided_at, a.recorded_by, a.notes,
  a.created_at, a.updated_at, a.created_by, a.updated_by,
  COALESCE((SELECT array_agg(work_item_id ORDER BY work_item_id) FROM job_approval_work_items WHERE approval_id = a.id),
           ARRAY[]::uuid[]) AS work_item_ids,
  COALESCE((SELECT array_agg(attachment_id ORDER BY attachment_id) FROM job_approval_evidence_attachments WHERE approval_id = a.id),
           ARRAY[]::uuid[]) AS evidence_attachment_ids`;

@Injectable()
export class ApprovalsRepository {
  constructor(private readonly db: DatabaseService) {}

  async validateWorkItems(
    client: PoolClient,
    jobId: string,
    workItemIds: string[],
    requireAdditionalWork: boolean,
  ): Promise<boolean> {
    if (workItemIds.length === 0) return true;
    const result = await client.query<{ id: string; is_additional_work: boolean }>(
      `SELECT id, is_additional_work FROM work_items WHERE job_id = $1 AND id = ANY($2::uuid[])`,
      [jobId, workItemIds],
    );
    if (result.rowCount !== workItemIds.length) return false;
    if (requireAdditionalWork) return result.rows.every((row) => row.is_additional_work);
    return true;
  }

  async create(
    client: PoolClient,
    data: {
      jobId: string;
      scope: string;
      description: string;
      estimatedAmount?: string;
      estimatedCurrency?: string;
      actor: string;
    },
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO job_approvals (job_id, scope, description, estimated_amount, estimated_currency_code, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING id`,
      [data.jobId, data.scope, data.description, data.estimatedAmount ?? null, data.estimatedCurrency ?? null, data.actor],
    );
    return result.rows[0].id;
  }

  async linkWorkItems(client: PoolClient, approvalId: string, workItemIds: string[]): Promise<void> {
    if (workItemIds.length === 0) return;
    await client.query(
      `INSERT INTO job_approval_work_items (approval_id, work_item_id)
       SELECT $1, unnest($2::uuid[])`,
      [approvalId, workItemIds],
    );
  }

  async findById(client: PoolClient, approvalId: string): Promise<JobApprovalRow | null> {
    const result = await client.query<JobApprovalRow>(
      `SELECT ${APPROVAL_SELECT} FROM job_approvals a WHERE a.id = $1`,
      [approvalId],
    );
    return result.rows[0] ?? null;
  }

  async findLocked(client: PoolClient, jobId: string, approvalId: string): Promise<JobApprovalRow | null> {
    const result = await client.query<JobApprovalRow>(
      `SELECT ${APPROVAL_SELECT} FROM job_approvals a WHERE a.id = $1 AND a.job_id = $2 FOR UPDATE OF a`,
      [approvalId, jobId],
    );
    return result.rows[0] ?? null;
  }

  async decide(
    client: PoolClient,
    approvalId: string,
    data: { decision: string; method: string; approvedByName: string; notes?: string; actor: string },
  ): Promise<void> {
    await client.query(
      `UPDATE job_approvals
       SET status = $1, method = $2, approved_by_name = $3, notes = $4,
           decided_at = CURRENT_TIMESTAMP, recorded_by = $5, updated_by = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6`,
      [data.decision, data.method, data.approvedByName, data.notes ?? null, data.actor, approvalId],
    );
  }

  async linkEvidenceAttachments(client: PoolClient, approvalId: string, attachmentIds: string[], actor: string): Promise<void> {
    if (attachmentIds.length === 0) return;
    const orderedIds = [...attachmentIds].sort();
    const result = await client.query<{ id: string }>(
      `SELECT id FROM attachments
       WHERE id = ANY($1::uuid[]) AND uploaded_by = $2 AND status = 'UNLINKED' AND purpose = 'APPROVAL_EVIDENCE'
         AND created_at > now() - interval '24 hours'
       ORDER BY id
       FOR UPDATE`,
      [orderedIds, actor],
    );
    if (result.rowCount !== attachmentIds.length) throw new Error('ATTACHMENT_NOT_LINKABLE');
    await client.query(
      `UPDATE attachments SET status = 'LINKED', owner_type = 'JOB_APPROVAL', owner_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($2::uuid[])`,
      [approvalId, attachmentIds],
    );
    await client.query(
      `INSERT INTO job_approval_evidence_attachments (approval_id, attachment_id)
       SELECT $1, unnest($2::uuid[])`,
      [approvalId, attachmentIds],
    );
  }

  async list(jobId: string, query: JobApprovalListQuery) {
    const where = ['a.job_id = $1'];
    const params: unknown[] = [jobId];
    if (query.status) {
      params.push(query.status);
      where.push(`a.status = $${params.length}`);
    }
    if (query.scope) {
      params.push(query.scope);
      where.push(`a.scope = $${params.length}`);
    }
    const condition = `WHERE ${where.join(' AND ')}`;
    if (query.sort) {
      for (const part of query.sort.split(',')) {
        if ((part.startsWith('-') ? part.slice(1) : part) !== 'createdAt') throw new Error('INVALID_SORT');
      }
    }
    const direction = query.sort?.startsWith('-') ? 'DESC' : 'ASC';
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM job_approvals a ${condition}`,
      params,
    );
    const rows = await this.db.query<JobApprovalRow>(
      `SELECT ${APPROVAL_SELECT} FROM job_approvals a ${condition}
       ORDER BY a.created_at ${direction}, a.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }
}

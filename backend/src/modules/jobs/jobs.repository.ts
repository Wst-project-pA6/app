import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../common/database/database.service';
import {
  JobListQuery,
  JobStageHistoryQuery,
  WorkItemListQuery,
} from './dto/job.dto';

export interface JobRow {
  id: string;
  job_number: string;
  customer_id: string;
  customer_display_name: string;
  vehicle_id: string;
  vehicle_plate: string;
  organization_scope_id: string;
  complaint: string;
  service_type: 'MAINTENANCE' | 'REPAIR' | 'DIAGNOSTIC' | 'INSPECTION' | 'OTHER';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  mileage_at_intake: number;
  stage: 'RECEIVED' | 'IN_PROGRESS' | 'QUALITY_CHECK' | 'READY' | 'DELIVERED';
  stage_changed_at: Date;
  bay_id: string | null;
  technician_id: string | null;
  scheduled_start_at: Date | null;
  expected_completion_at: Date;
  delivered_at: Date | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  billable_work_allowed: boolean;
  approved_scopes: string[];
  pending_approval_count: number;
}

export interface WorkItemRow {
  id: string;
  job_id: string;
  description: string;
  status: 'PENDING' | 'DONE' | 'CANCELLED';
  is_additional_work: boolean;
  approval_id: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

export interface TechnicianRow {
  id: string;
  display_name: string;
}

export interface VehicleForJobRow {
  id: string;
  customer_id: string;
  customer_display_name: string;
  organization_scope_id: string;
  mileage: number;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface AssignmentConflictRow {
  kind: 'BAY_JOB_CONFLICT' | 'BAY_SESSION_CONFLICT' | 'MENTOR_SESSION_CONFLICT';
  reference_id: string;
  reference_label: string;
  starts_at: Date;
  ends_at: Date;
}

export interface StageEventRow {
  id: string;
  job_id: string;
  from_stage: 'RECEIVED' | 'IN_PROGRESS' | 'QUALITY_CHECK' | 'READY' | 'DELIVERED' | null;
  to_stage: 'RECEIVED' | 'IN_PROGRESS' | 'QUALITY_CHECK' | 'READY' | 'DELIVERED';
  transitioned_by: string;
  transitioned_at: Date;
  reason: string | null;
}

const JOB_SELECT = `
  j.id, j.job_number, j.customer_id, c.display_name AS customer_display_name,
  j.vehicle_id, v.plate AS vehicle_plate, j.organization_scope_id, j.complaint,
  j.service_type, j.priority, j.mileage_at_intake, j.stage, j.stage_changed_at,
  j.bay_id, j.technician_id, j.scheduled_start_at, j.expected_completion_at,
  j.delivered_at, j.version, j.created_at, j.updated_at, j.created_by, j.updated_by,
  EXISTS (SELECT 1 FROM job_approvals ja
          WHERE ja.job_id = j.id AND ja.scope = 'INITIAL_WORK' AND ja.status = 'APPROVED')
    AS billable_work_allowed,
  COALESCE((SELECT array_agg(DISTINCT ja.scope ORDER BY ja.scope)
            FROM job_approvals ja WHERE ja.job_id = j.id AND ja.status = 'APPROVED'),
           ARRAY[]::text[]) AS approved_scopes,
  (SELECT count(*)::int FROM job_approvals ja
   WHERE ja.job_id = j.id AND ja.status = 'PENDING') AS pending_approval_count`;

const WORK_ITEM_SELECT = `
  w.id, w.job_id, w.description, w.status, w.is_additional_work, w.approval_id,
  w.completed_at, w.created_at, w.updated_at, w.created_by, w.updated_by`;

const JOB_SORT_FIELDS: Record<string, string> = {
  jobNumber: 'j.job_number',
  createdAt: 'j.created_at',
  expectedCompletionAt: 'j.expected_completion_at',
  priority: 'j.priority',
};

const WORK_ITEM_SORT_FIELDS: Record<string, string> = { createdAt: 'w.created_at' };

function orderBy(sort: string | undefined, fields: Record<string, string>, defaultSort: string): string {
  const requested = sort?.split(',') ?? [defaultSort];
  return requested.map((part) => {
    const descending = part.startsWith('-');
    const field = fields[descending ? part.slice(1) : part];
    if (!field) throw new Error('INVALID_SORT');
    return `${field} ${descending ? 'DESC' : 'ASC'}`;
  }).join(', ');
}

@Injectable()
export class JobsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findAccessibleCustomer(customerId: string, scopeIds: string[]): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(
      `SELECT c.id FROM customers c
       JOIN organization_scopes os ON os.id = c.organization_scope_id AND os.status = 'ACTIVE'
       WHERE c.id = $1 AND c.organization_scope_id = ANY($2::uuid[])`,
      [customerId, scopeIds],
    );
    return result.rowCount === 1;
  }

  async findAccessibleTechnician(technicianId: string, scopeIds: string[]): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(
      `SELECT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role_code = 'TECHNICIAN'
       JOIN user_organization_scopes uos ON uos.user_id = u.id
       JOIN organization_scopes os ON os.id = uos.organization_scope_id AND os.status = 'ACTIVE'
       WHERE u.id = $1 AND u.status = 'ACTIVE'
         AND uos.organization_scope_id = ANY($2::uuid[])`,
      [technicianId, scopeIds],
    );
    return result.rowCount === 1;
  }

  async findAccessibleVehicle(vehicleId: string, scopeIds: string[], client?: PoolClient, lock = false): Promise<VehicleForJobRow | null> {
    const sql = `SELECT v.id, v.customer_id, c.display_name AS customer_display_name,
                        c.organization_scope_id, v.mileage, v.status
                 FROM vehicles v
                 JOIN customers c ON c.id = v.customer_id
                 JOIN organization_scopes os ON os.id = c.organization_scope_id AND os.status = 'ACTIVE'
                 WHERE v.id = $1 AND c.organization_scope_id = ANY($2::uuid[])${lock ? ' FOR UPDATE OF v' : ''}`;
    const result = client
      ? await client.query<VehicleForJobRow>(sql, [vehicleId, scopeIds])
      : await this.db.query<VehicleForJobRow>(sql, [vehicleId, scopeIds]);
    return result.rows[0] ?? null;
  }

  async findAccessibleBay(bayId: string, scopeIds: string[], client?: PoolClient, lock = false): Promise<{ id: string; organization_scope_id: string; status: string } | null> {
    const sql = `SELECT b.id, b.organization_scope_id, b.status
                 FROM bays b
                 JOIN organization_scopes os ON os.id = b.organization_scope_id AND os.status = 'ACTIVE'
                 WHERE b.id = $1 AND b.organization_scope_id = ANY($2::uuid[])${lock ? ' FOR UPDATE OF b' : ''}`;
    const result = client
      ? await client.query<{ id: string; organization_scope_id: string; status: string }>(sql, [bayId, scopeIds])
      : await this.db.query<{ id: string; organization_scope_id: string; status: string }>(sql, [bayId, scopeIds]);
    return result.rows[0] ?? null;
  }

  async findAssignableTechnician(
    technicianId: string,
    scopeId: string,
    client: PoolClient,
    lock = false,
  ): Promise<TechnicianRow | null> {
    const result = await client.query<TechnicianRow>(
      `SELECT u.id, u.display_name
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id AND ur.role_code = 'TECHNICIAN'
       JOIN user_organization_scopes uos ON uos.user_id = u.id AND uos.organization_scope_id = $2
       JOIN organization_scopes os ON os.id = uos.organization_scope_id AND os.status = 'ACTIVE'
       WHERE u.id = $1 AND u.status = 'ACTIVE'${lock ? ' FOR UPDATE OF u' : ''}`,
      [technicianId, scopeId],
    );
    return result.rows[0] ?? null;
  }

  async listTechnicians(query: { page: number; pageSize: number; q?: string; sort?: string }, scopeIds: string[]) {
    if (query.sort) {
      for (const part of query.sort.split(',')) {
        if ((part.startsWith('-') ? part.slice(1) : part) !== 'displayName') throw new Error('INVALID_SORT');
      }
    }
    const where = [
      `u.status = 'ACTIVE'`,
      `ur.role_code = 'TECHNICIAN'`,
      'uos.organization_scope_id = ANY($1::uuid[])',
      `EXISTS (SELECT 1 FROM organization_scopes os
              WHERE os.id = uos.organization_scope_id AND os.status = 'ACTIVE')`,
    ];
    const params: unknown[] = [scopeIds];
    if (query.q) {
      params.push(`%${query.q}%`);
      where.push(`u.display_name ILIKE $${params.length}`);
    }
    const condition = `WHERE ${where.join(' AND ')}`;
    const count = await this.db.queryValue<number>(
      `SELECT count(DISTINCT u.id)::int AS count
       FROM users u JOIN user_roles ur ON ur.user_id = u.id
       JOIN user_organization_scopes uos ON uos.user_id = u.id ${condition}`,
      params,
    );
    const offset = (query.page - 1) * query.pageSize;
    const rows = await this.db.query<TechnicianRow>(
      `SELECT DISTINCT u.id, u.display_name
       FROM users u JOIN user_roles ur ON ur.user_id = u.id
       JOIN user_organization_scopes uos ON uos.user_id = u.id ${condition}
       ORDER BY u.display_name ${query.sort?.startsWith('-') ? 'DESC' : 'ASC'}, u.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }

  async findScoped(
    jobId: string,
    scopeIds: string[],
    client?: PoolClient,
    lock = false,
    assignedTechnicianId?: string,
  ): Promise<JobRow | null> {
    const assigned = assignedTechnicianId ? ` AND j.technician_id = $3` : '';
    const sql = `SELECT ${JOB_SELECT}
      FROM job_cards j
      JOIN customers c ON c.id = j.customer_id AND c.organization_scope_id = j.organization_scope_id
      JOIN vehicles v ON v.id = j.vehicle_id AND v.customer_id = j.customer_id
      JOIN organization_scopes os ON os.id = j.organization_scope_id AND os.status = 'ACTIVE'
      WHERE j.id = $1 AND j.organization_scope_id = ANY($2::uuid[])${assigned}${lock ? ' FOR UPDATE OF j' : ''}`;
    const params = assignedTechnicianId ? [jobId, scopeIds, assignedTechnicianId] : [jobId, scopeIds];
    const result = client
      ? await client.query<JobRow>(sql, params)
      : await this.db.query<JobRow>(sql, params);
    return result.rows[0] ?? null;
  }

  async findById(client: PoolClient, jobId: string): Promise<JobRow | null> {
    const result = await client.query<JobRow>(
      `SELECT ${JOB_SELECT}
       FROM job_cards j
      JOIN customers c ON c.id = j.customer_id AND c.organization_scope_id = j.organization_scope_id
       JOIN vehicles v ON v.id = j.vehicle_id AND v.customer_id = j.customer_id
       JOIN organization_scopes os ON os.id = j.organization_scope_id AND os.status = 'ACTIVE'
       WHERE j.id = $1`,
      [jobId],
    );
    return result.rows[0] ?? null;
  }

  async create(
    client: PoolClient,
    data: {
      vehicleId: string;
      customerId: string;
      organizationScopeId: string;
      complaint: string;
      serviceType: string;
      priority: string;
      mileageAtIntake: number;
      expectedCompletionAt: string;
      actor: string;
    },
  ): Promise<JobRow> {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO job_cards
       (job_number, customer_id, vehicle_id, organization_scope_id, complaint, service_type,
        priority, mileage_at_intake, stage, expected_completion_at, created_by, updated_by)
       VALUES ('JC-' || to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY') || '-' || lpad(nextval('job_number_seq')::text, 6, '0'),
               $1, $2, $3, $4, $5, $6, $7, 'RECEIVED', $8, $9, $9)
       RETURNING id`,
      [data.customerId, data.vehicleId, data.organizationScopeId, data.complaint,
        data.serviceType, data.priority, data.mileageAtIntake, data.expectedCompletionAt, data.actor],
    );
    const row = await this.findScoped(inserted.rows[0].id, [data.organizationScopeId], client);
    if (!row) throw new Error('Created job could not be read');
    return row;
  }

  async createStageEvent(client: PoolClient, jobId: string, actor: string): Promise<void> {
    await client.query(
      `INSERT INTO job_stage_events (job_id, from_stage, to_stage, transitioned_by)
       VALUES ($1, NULL, 'RECEIVED', $2)`,
      [jobId, actor],
    );
  }

  async createWorkItem(client: PoolClient, data: { jobId: string; description: string; isAdditionalWork: boolean; actor: string }): Promise<WorkItemRow> {
    const result = await client.query<WorkItemRow>(
      `INSERT INTO work_items (job_id, description, status, is_additional_work, created_by, updated_by)
       VALUES ($1, $2, 'PENDING', $3, $4, $4)
       RETURNING ${WORK_ITEM_SELECT.replaceAll('w.', '')}`,
      [data.jobId, data.description, data.isAdditionalWork, data.actor],
    );
    return result.rows[0];
  }

  async update(
    client: PoolClient,
    jobId: string,
    version: number,
    values: Record<string, unknown>,
    actor: string,
  ): Promise<JobRow | null> {
    const entries = Object.entries(values);
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
    const actorParameter = entries.length + 1;
    const versionParameter = entries.length + 2;
    const idParameter = entries.length + 3;
    const result = await client.query<{ id: string }>(
      `UPDATE job_cards SET ${assignments}, version = version + 1,
              updated_by = $${actorParameter}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idParameter} AND version = $${versionParameter}
       RETURNING id`,
      [...entries.map(([, value]) => value), actor, version, jobId],
    );
    if (result.rowCount !== 1) return null;
    return this.findById(client, jobId);
  }

  async assign(
    client: PoolClient,
    jobId: string,
    version: number,
    data: { bayId: string; technicianId: string; scheduledStartAt: string; expectedCompletionAt: string; actor: string },
  ): Promise<JobRow | null> {
    const result = await client.query<{ id: string }>(
      `UPDATE job_cards
       SET bay_id = $1, technician_id = $2, scheduled_start_at = $3,
           expected_completion_at = $4, version = version + 1,
           updated_by = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND version = $7
       RETURNING id`,
      [data.bayId, data.technicianId, data.scheduledStartAt, data.expectedCompletionAt,
        data.actor, jobId, version],
    );
    if (result.rowCount !== 1) return null;
    return this.findById(client, jobId);
  }

  async list(query: JobListQuery, scopeIds: string[], assignedTechnicianId?: string) {
    const where = [
      'j.organization_scope_id = ANY($1::uuid[])',
      `EXISTS (SELECT 1 FROM organization_scopes os
              WHERE os.id = j.organization_scope_id AND os.status = 'ACTIVE')`,
    ];
    const params: unknown[] = [scopeIds];
    const add = (sql: string, value: unknown): void => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (assignedTechnicianId) add('j.technician_id = ?', assignedTechnicianId);
    if (query.q) {
      const pattern = `%${query.q}%`;
      params.push(pattern);
      const parameter = `$${params.length}`;
      where.push(`(j.job_number ILIKE ${parameter} OR c.display_name ILIKE ${parameter}
                  OR v.plate ILIKE ${parameter} OR j.complaint ILIKE ${parameter})`);
    }
    if (query.from) add('j.expected_completion_at >= ?::timestamptz', query.from);
    if (query.to) add('j.expected_completion_at < ?::timestamptz', query.to);
    if (query.stage) add('j.stage = ?', query.stage);
    if (query.priority) add('j.priority = ?', query.priority);
    if (query.jobNumber) add('j.job_number = ?', query.jobNumber);
    if (query.technicianId) add('j.technician_id = ?', query.technicianId);
    if (query.bayId) add('j.bay_id = ?', query.bayId);
    if (query.vehicleId) add('j.vehicle_id = ?', query.vehicleId);
    if (query.customerId) add('j.customer_id = ?', query.customerId);
    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count
       FROM job_cards j JOIN customers c ON c.id = j.customer_id AND c.organization_scope_id = j.organization_scope_id
       JOIN vehicles v ON v.id = j.vehicle_id AND v.customer_id = j.customer_id ${condition}`,
      params,
    );
    const rows = await this.db.query<JobRow>(
      `SELECT ${JOB_SELECT}
       FROM job_cards j JOIN customers c ON c.id = j.customer_id AND c.organization_scope_id = j.organization_scope_id
       JOIN vehicles v ON v.id = j.vehicle_id AND v.customer_id = j.customer_id ${condition}
       ORDER BY ${orderBy(query.sort, JOB_SORT_FIELDS, '-createdAt')}, j.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }

  async listWorkItems(jobId: string, query: WorkItemListQuery) {
    const params: unknown[] = [jobId];
    const where = ['w.job_id = $1'];
    if (query.status) {
      params.push(query.status);
      where.push(`w.status = $${params.length}`);
    }
    const condition = `WHERE ${where.join(' AND ')}`;
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM work_items w ${condition}`,
      params,
    );
    const rows = await this.db.query<WorkItemRow>(
      `SELECT ${WORK_ITEM_SELECT} FROM work_items w ${condition}
       ORDER BY ${orderBy(query.sort, WORK_ITEM_SORT_FIELDS, 'createdAt')}, w.id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }

  async findWorkItem(client: PoolClient, jobId: string, workItemId: string, lock = false): Promise<WorkItemRow | null> {
    const result = await client.query<WorkItemRow>(
      `SELECT ${WORK_ITEM_SELECT} FROM work_items w
       WHERE w.job_id = $1 AND w.id = $2${lock ? ' FOR UPDATE' : ''}`,
      [jobId, workItemId],
    );
    return result.rows[0] ?? null;
  }

  async updateWorkItem(client: PoolClient, workItemId: string, values: Record<string, unknown>, actor: string): Promise<WorkItemRow | null> {
    const entries = Object.entries(values);
    const assignments = entries.map(([column], index) => `${column} = $${index + 1}`).join(', ');
    const actorParameter = entries.length + 1;
    const idParameter = entries.length + 2;
    const result = await client.query<WorkItemRow>(
      `UPDATE work_items SET ${assignments}, updated_by = $${actorParameter}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idParameter}
       RETURNING ${WORK_ITEM_SELECT.replaceAll('w.', '')}`,
      [...entries.map(([, value]) => value), actor, workItemId],
    );
    return result.rows[0] ?? null;
  }

  async findAssignmentConflicts(
    client: PoolClient,
    jobId: string,
    bayId: string,
    technicianId: string,
    startsAt: string,
    endsAt: string,
  ): Promise<AssignmentConflictRow[]> {
    const result = await client.query<AssignmentConflictRow>(
      `SELECT kind, reference_id, reference_label, starts_at, ends_at
       FROM (
         SELECT 'BAY_JOB_CONFLICT'::text AS kind, j.id AS reference_id,
                j.job_number AS reference_label, j.scheduled_start_at AS starts_at,
                j.expected_completion_at AS ends_at
         FROM job_cards j
         WHERE j.id <> $1 AND j.bay_id = $2
           AND j.stage IN ('RECEIVED', 'IN_PROGRESS', 'QUALITY_CHECK')
           AND j.scheduled_start_at IS NOT NULL
           AND j.scheduled_start_at < $4::timestamptz
           AND j.expected_completion_at > $3::timestamptz
         UNION ALL
         SELECT 'BAY_SESSION_CONFLICT'::text, s.id, s.title, s.starts_at, s.ends_at
         FROM training_sessions s
         WHERE s.bay_id = $2 AND s.status = 'PUBLISHED'
           AND s.starts_at < $4::timestamptz AND s.ends_at > $3::timestamptz
         UNION ALL
         SELECT 'MENTOR_SESSION_CONFLICT'::text, s.id, s.title, s.starts_at, s.ends_at
         FROM training_sessions s
         WHERE s.mentor_id = $5 AND s.status = 'PUBLISHED'
           AND s.starts_at < $4::timestamptz AND s.ends_at > $3::timestamptz
       ) conflicts
       ORDER BY starts_at ASC, kind ASC, reference_id ASC`,
      [jobId, bayId, startsAt, endsAt, technicianId],
    );
    return result.rows;
  }

  async transitionStage(
    client: PoolClient,
    jobId: string,
    currentVersion: number,
    toStage: string,
    actor: string,
    setDeliveredAt: boolean,
  ): Promise<JobRow | null> {
    const result = await client.query<{ id: string }>(
      `UPDATE job_cards
       SET stage = $1, stage_changed_at = CURRENT_TIMESTAMP, version = version + 1,
           updated_by = $2, updated_at = CURRENT_TIMESTAMP
           ${setDeliveredAt ? ', delivered_at = CURRENT_TIMESTAMP' : ''}
       WHERE id = $3 AND version = $4
       RETURNING id`,
      [toStage, actor, jobId, currentVersion],
    );
    if (result.rowCount !== 1) return null;
    return this.findById(client, jobId);
  }

  async recordTransition(
    client: PoolClient,
    jobId: string,
    fromStage: string,
    toStage: string,
    actor: string,
    reason?: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO job_stage_events (job_id, from_stage, to_stage, transitioned_by, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [jobId, fromStage, toStage, actor, reason ?? null],
    );
  }

  async listStageEvents(jobId: string, query: JobStageHistoryQuery) {
    if (query.sort) {
      for (const part of query.sort.split(',')) {
        if ((part.startsWith('-') ? part.slice(1) : part) !== 'transitionedAt') throw new Error('INVALID_SORT');
      }
    }
    const direction = query.sort?.startsWith('-') ? 'DESC' : 'ASC';
    const offset = (query.page - 1) * query.pageSize;
    const count = await this.db.queryValue<number>(
      `SELECT count(*)::int AS count FROM job_stage_events WHERE job_id = $1`,
      [jobId],
    );
    const rows = await this.db.query<StageEventRow>(
      `SELECT id, job_id, from_stage, to_stage, transitioned_by, transitioned_at, reason
       FROM job_stage_events WHERE job_id = $1
       ORDER BY transitioned_at ${direction}, id ASC
       LIMIT $2 OFFSET $3`,
      [jobId, query.pageSize, offset],
    );
    return { rows: rows.rows, totalItems: count ?? 0 };
  }

  async countIncompleteWorkItems(client: PoolClient, jobId: string): Promise<number> {
    const result = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM work_items
       WHERE job_id = $1 AND status NOT IN ('DONE', 'CANCELLED')`,
      [jobId],
    );
    return result.rows[0]?.count ?? 0;
  }

  async findLatestQualityCheck(client: PoolClient, jobId: string): Promise<{ result: 'PASSED' | 'FAILED' } | null> {
    const result = await client.query<{ result: 'PASSED' | 'FAILED' }>(
      `SELECT result FROM quality_checks WHERE job_id = $1 ORDER BY performed_at DESC, id DESC LIMIT 1`,
      [jobId],
    );
    return result.rows[0] ?? null;
  }

  async hasNonVoidInvoice(client: PoolClient, jobId: string): Promise<boolean> {
    const result = await client.query(`SELECT 1 FROM invoices WHERE job_id = $1 AND status <> 'VOID' LIMIT 1`, [jobId]);
    return (result.rowCount ?? 0) > 0;
  }

  async generateDraftInvoice(client: PoolClient, jobId: string, customerId: string, actor: string): Promise<string> {
    const inserted = await client.query<{ id: string }>(
      `WITH totals AS (
         SELECT
           COALESCE((SELECT SUM(amount) FROM labor_entries WHERE job_id = $1 AND status = 'ACTIVE'), 0) AS labor_subtotal,
           COALESCE((SELECT SUM((quantity - reversed_quantity) * unit_price_amount) FROM part_issues WHERE job_id = $1), 0) AS parts_subtotal,
           COALESCE((SELECT SUM(cost_amount) FROM sublet_entries WHERE job_id = $1 AND status = 'ACTIVE'), 0) AS sublet_subtotal
       ),
       calc AS (
         SELECT
           t.labor_subtotal, t.parts_subtotal, t.sublet_subtotal,
           (t.labor_subtotal + t.parts_subtotal + t.sublet_subtotal) AS subtotal,
           fs.currency_code, fs.tax_rate_percent
         FROM totals t, finance_settings fs WHERE fs.id = TRUE
       )
       INSERT INTO invoices (
         job_id, customer_id, status, currency_code,
         labor_subtotal, parts_subtotal, sublet_subtotal, subtotal,
         discount_total, taxable_amount, tax_rate_percent, tax_amount, total_amount,
         created_by, updated_by
       )
       SELECT
         $1, $2, 'DRAFT', c.currency_code,
         c.labor_subtotal, c.parts_subtotal, c.sublet_subtotal, c.subtotal,
         0, c.subtotal, c.tax_rate_percent,
         ROUND(c.subtotal * c.tax_rate_percent / 100, 4),
         c.subtotal + ROUND(c.subtotal * c.tax_rate_percent / 100, 4),
         $3, $3
       FROM calc c
       RETURNING id`,
      [jobId, customerId, actor],
    );
    const invoiceId = inserted.rows[0].id;

    await client.query(
      `INSERT INTO invoice_lines
         (invoice_id, line_type, description, quantity, unit_price_amount, unit_price_currency,
          line_total_amount, line_total_currency, source_type, source_labor_entry_id)
       SELECT $1, 'LABOR', COALESCE(le.description, 'Labor'), ROUND(le.duration_minutes / 60.0, 4),
              le.hourly_rate_amount, le.hourly_rate_currency, le.amount, le.amount_currency,
              'LABOR_ENTRY', le.id
       FROM labor_entries le WHERE le.job_id = $2 AND le.status = 'ACTIVE'`,
      [invoiceId, jobId],
    );

    await client.query(
      `INSERT INTO invoice_lines
         (invoice_id, line_type, description, quantity, unit_price_amount, unit_price_currency,
          line_total_amount, line_total_currency, source_type, source_part_issue_id)
       SELECT $1, 'PART', COALESCE(p.name_en, pi.part_sku), (pi.quantity - pi.reversed_quantity),
              pi.unit_price_amount, pi.unit_price_currency,
              (pi.quantity - pi.reversed_quantity) * pi.unit_price_amount, pi.line_total_currency,
              'PART_ISSUE', pi.id
       FROM part_issues pi JOIN parts p ON p.id = pi.part_id
       WHERE pi.job_id = $2 AND (pi.quantity - pi.reversed_quantity) > 0`,
      [invoiceId, jobId],
    );

    await client.query(
      `INSERT INTO invoice_lines
         (invoice_id, line_type, description, quantity, unit_price_amount, unit_price_currency,
          line_total_amount, line_total_currency, source_type, source_sublet_entry_id)
       SELECT $1, 'SUBLET', se.description, 1, se.cost_amount, se.cost_currency,
              se.cost_amount, se.cost_currency, 'SUBLET_ENTRY', se.id
       FROM sublet_entries se WHERE se.job_id = $2 AND se.status = 'ACTIVE'`,
      [invoiceId, jobId],
    );

    return invoiceId;
  }

  async linkAttachments(client: PoolClient, attachmentIds: string[], actor: string, jobId: string): Promise<void> {
    if (attachmentIds.length === 0) return;
    const orderedIds = [...attachmentIds].sort();
    const result = await client.query<{ id: string }>(
      `SELECT id FROM attachments
       WHERE id = ANY($1::uuid[]) AND uploaded_by = $2 AND status = 'UNLINKED'
         AND purpose = 'JOB_PHOTO' AND created_at > now() - interval '24 hours'
       ORDER BY id
       FOR UPDATE`,
      [orderedIds, actor],
    );
    if (result.rowCount !== attachmentIds.length) throw new Error('ATTACHMENT_NOT_LINKABLE');
    await client.query(
      `UPDATE attachments SET status = 'LINKED', owner_type = 'JOB_CARD', owner_id = $1,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($2::uuid[])`,
      [jobId, attachmentIds],
    );
    await client.query(
      `INSERT INTO job_card_attachments (job_id, attachment_id)
       SELECT $1, unnest($2::uuid[])`,
      [jobId, attachmentIds],
    );
  }
}

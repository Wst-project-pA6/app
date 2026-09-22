import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { RequestContext } from '../request-context/request-context';
import { redactChanges } from './redact.util';

export interface AuditEventInput {
  actorUserId: string;
  actorRoles: string[];
  action: string;
  entityType: string;
  entityId?: string | null;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILED';
  summary?: string;
  changes?: unknown;
}

export interface AuditEventRow {
  id: string;
  occurred_at: Date;
  actor_user_id: string | null;
  actor_roles: string[];
  action: string;
  entity_type: string;
  entity_id: string | null;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILED';
  request_id: string;
  summary: string | null;
  changes: unknown;
}

export interface AuditEventListFilter {
  from?: string;
  to?: string;
  actorUserId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  outcome?: 'SUCCESS' | 'DENIED' | 'FAILED';
}

const SORTABLE_FIELDS: Record<string, string> = { occurredAt: 'occurred_at' };

/**
 * Smallest reusable audit writer AND reader over the authoritative audit_events table.
 * Callers must invoke record() with the same PoolClient used for the surrounding
 * business transaction so the audit event commits or rolls back atomically with it.
 * Sensitive values in `changes` are centrally redacted here (see redact.util) so no caller
 * needs to reinvent redaction, and reads apply the same redaction defensively.
 */
@Injectable()
export class AuditService {
  constructor(private readonly requestContext: RequestContext) {}

  async record(client: PoolClient, event: AuditEventInput): Promise<void> {
    const changes = redactChanges(event.changes);
    await client.query(
      `INSERT INTO audit_events
       (actor_user_id, actor_roles, action, entity_type, entity_id, outcome, request_id, summary, changes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        event.actorUserId,
        event.actorRoles,
        event.action,
        event.entityType,
        event.entityId ?? null,
        event.outcome,
        this.requestContext.getRequestId() ?? 'unknown',
        event.summary ?? null,
        changes !== undefined ? JSON.stringify(changes) : null,
      ],
    );
  }

  async getById(client: PoolClient, auditEventId: string): Promise<AuditEventRow | null> {
    const result = await client.query<AuditEventRow>(
      `SELECT id, occurred_at, actor_user_id, actor_roles, action, entity_type, entity_id,
              outcome, request_id, summary, changes
       FROM audit_events WHERE id = $1`,
      [auditEventId],
    );
    const row = result.rows[0] ?? null;
    return row ? this.redactRow(row) : null;
  }

  async list(
    client: PoolClient,
    filter: AuditEventListFilter,
    query: { page: number; pageSize: number; sort?: string },
  ): Promise<{ rows: AuditEventRow[]; totalItems: number }> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown): void => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };
    if (filter.from) add('occurred_at >= ?::timestamptz', filter.from);
    if (filter.to) add('occurred_at < ?::timestamptz', filter.to);
    if (filter.actorUserId) add('actor_user_id = ?', filter.actorUserId);
    if (filter.action) add('action = ?', filter.action);
    if (filter.entityType) add('entity_type = ?', filter.entityType);
    if (filter.entityId) add('entity_id = ?', filter.entityId);
    if (filter.outcome) add('outcome = ?', filter.outcome);

    const condition = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const order = this.orderBy(query.sort);
    const offset = (query.page - 1) * query.pageSize;

    const count = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM audit_events ${condition}`,
      params,
    );
    const rows = await client.query<AuditEventRow>(
      `SELECT id, occurred_at, actor_user_id, actor_roles, action, entity_type, entity_id,
              outcome, request_id, summary, changes
       FROM audit_events ${condition}
       ORDER BY ${order}, id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, query.pageSize, offset],
    );
    return { rows: rows.rows.map((row) => this.redactRow(row)), totalItems: count.rows[0]?.count ?? 0 };
  }

  private redactRow(row: AuditEventRow): AuditEventRow {
    return { ...row, changes: row.changes === null ? null : redactChanges(row.changes) };
  }

  private orderBy(sort: string | undefined): string {
    const parts = sort ? sort.split(',') : ['-occurredAt'];
    return parts
      .map((part) => {
        const descending = part.startsWith('-');
        const field = SORTABLE_FIELDS[descending ? part.slice(1) : part];
        if (!field) throw new Error('INVALID_SORT');
        return `${field} ${descending ? 'DESC' : 'ASC'}`;
      })
      .join(', ');
  }
}

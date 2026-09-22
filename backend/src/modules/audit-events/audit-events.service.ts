import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditEventRow, AuditService } from '../../common/audit/audit.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { AuditEventListQuery } from './dto/audit-event.dto';

const notFound = (): AppError => new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');
const badRequest = (message: string): AppError => new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

function mapAuditEvent(row: AuditEventRow) {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    ...(row.actor_user_id ? { actorUserId: row.actor_user_id } : {}),
    ...(row.actor_roles?.length ? { actorRoles: row.actor_roles } : {}),
    action: row.action,
    entityType: row.entity_type,
    ...(row.entity_id ? { entityId: row.entity_id } : {}),
    outcome: row.outcome,
    requestId: row.request_id,
    ...(row.summary ? { summary: row.summary } : {}),
    ...(row.changes ? { changes: row.changes } : {}),
  };
}

function page<T>(query: { page: number; pageSize: number }, rows: T[], totalItems: number) {
  return {
    items: rows,
    page: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}

/**
 * Reads audit_events through the same AuditService that writes them (Session 10), so there is
 * one source of truth for redaction and row mapping. Every successful read is itself audited
 * in the same transaction as the read — a fixed AUDIT_EVENT.READ action, never re-entering
 * list()/getById(), so there is no recursion.
 */
@Injectable()
export class AuditEventsService {
  constructor(
    private readonly audit: AuditService,
    private readonly transaction: TransactionService,
  ) {}

  async list(query: AuditEventListQuery, actor: AuthenticatedPrincipal) {
    if (query.from && query.to && Date.parse(query.from) >= Date.parse(query.to)) {
      throw badRequest('From must be before to');
    }
    return this.transaction.runInTransaction(async (client) => {
      let result;
      try {
        result = await this.audit.list(
          client,
          {
            from: query.from,
            to: query.to,
            actorUserId: query.actorUserId,
            action: query.action,
            entityType: query.entityType,
            entityId: query.entityId,
            outcome: query.outcome,
          },
          { page: query.page, pageSize: query.pageSize, sort: query.sort },
        );
      } catch (error) {
        if (error instanceof Error && error.message === 'INVALID_SORT') throw badRequest('Unknown sort field');
        throw error;
      }
      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'AUDIT_EVENT.READ',
        entityType: 'AUDIT_EVENT',
        outcome: 'SUCCESS',
        summary: 'Searched audit events',
      });
      return page(query, result.rows.map(mapAuditEvent), result.totalItems);
    });
  }

  async get(auditEventId: string, actor: AuthenticatedPrincipal) {
    return this.transaction.runInTransaction(async (client) => {
      const row = await this.audit.getById(client, auditEventId);
      if (!row) throw notFound();
      await this.audit.record(client, {
        actorUserId: actor.id,
        actorRoles: actor.roles,
        action: 'AUDIT_EVENT.READ',
        entityType: 'AUDIT_EVENT',
        entityId: auditEventId,
        outcome: 'SUCCESS',
        summary: 'Read an audit event',
      });
      return mapAuditEvent(row);
    });
  }
}

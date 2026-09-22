import { request } from '../client'
import type { QueryParams } from '../queryString'
import type { AuditEvent, AuditEventPage } from '../types'

export interface ListAuditEventsParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  from?: string
  to?: string
  actorUserId?: string
  action?: string
  entityType?: string
  entityId?: string
  outcome?: 'SUCCESS' | 'DENIED' | 'FAILED'
}

export function listAuditEvents(params: ListAuditEventsParams = {}, signal?: AbortSignal): Promise<AuditEventPage> {
  return request<AuditEventPage>('/audit-events', { method: 'GET', query: params, signal })
}

export function getAuditEvent(auditEventId: string, signal?: AbortSignal): Promise<AuditEvent> {
  return request<AuditEvent>(`/audit-events/${auditEventId}`, { method: 'GET', signal })
}

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import * as auditApi from '../endpoints/audit'
import { queryKeys } from '../queryKeys'

export function useAuditEventsQuery(params: auditApi.ListAuditEventsParams) {
  return useQuery({
    queryKey: queryKeys.audit.list(params),
    queryFn: ({ signal }) => auditApi.listAuditEvents(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useAuditEventQuery(auditEventId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.audit.detail(auditEventId ?? ''),
    queryFn: ({ signal }) => auditApi.getAuditEvent(auditEventId as string, signal),
    enabled: Boolean(auditEventId),
  })
}

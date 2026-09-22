import { request } from '../client'
import type { QueryParams } from '../queryString'
import type {
  LaborEntry,
  LaborEntryCreateRequest,
  LaborEntryPage,
  LaborEntryUpdateRequest,
  ReasonRequest,
} from '../types'

export interface ListLaborEntriesParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  status?: 'ACTIVE' | 'VOIDED'
}

export function listLaborEntries(
  jobId: string,
  params: ListLaborEntriesParams = {},
  signal?: AbortSignal,
): Promise<LaborEntryPage> {
  return request<LaborEntryPage>(`/job-cards/${jobId}/labor-entries`, { method: 'GET', query: params, signal })
}

export function createLaborEntry(
  jobId: string,
  payload: LaborEntryCreateRequest,
  signal?: AbortSignal,
): Promise<LaborEntry> {
  return request<LaborEntry>(`/job-cards/${jobId}/labor-entries`, { method: 'POST', body: payload, signal })
}

export function updateLaborEntry(
  jobId: string,
  laborEntryId: string,
  payload: LaborEntryUpdateRequest,
  signal?: AbortSignal,
): Promise<LaborEntry> {
  return request<LaborEntry>(`/job-cards/${jobId}/labor-entries/${laborEntryId}`, {
    method: 'PATCH',
    body: payload,
    signal,
  })
}

export function voidLaborEntry(
  jobId: string,
  laborEntryId: string,
  payload: ReasonRequest,
  signal?: AbortSignal,
): Promise<LaborEntry> {
  return request<LaborEntry>(`/job-cards/${jobId}/labor-entries/${laborEntryId}/void`, {
    method: 'POST',
    body: payload,
    signal,
  })
}

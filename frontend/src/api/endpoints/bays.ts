import { request } from '../client'
import type { QueryParams } from '../queryString'
import type { Bay, BayCalendar, BayCreateRequest, BayPage, BayUpdateRequest } from '../types'

export interface ListBaysParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  status?: 'ACTIVE' | 'MAINTENANCE' | 'INACTIVE'
}

export function listBays(params: ListBaysParams = {}, signal?: AbortSignal): Promise<BayPage> {
  return request<BayPage>('/bays', { method: 'GET', query: params, signal })
}

export function createBay(payload: BayCreateRequest, signal?: AbortSignal): Promise<Bay> {
  return request<Bay>('/bays', { method: 'POST', body: payload, signal })
}

export function updateBay(bayId: string, payload: BayUpdateRequest, signal?: AbortSignal): Promise<Bay> {
  return request<Bay>(`/bays/${bayId}`, { method: 'PATCH', body: payload, signal })
}

export function getBayCalendar(
  bayId: string,
  params: { from: string; to: string },
  signal?: AbortSignal,
): Promise<BayCalendar> {
  return request<BayCalendar>(`/bays/${bayId}/calendar`, { method: 'GET', query: params, signal })
}

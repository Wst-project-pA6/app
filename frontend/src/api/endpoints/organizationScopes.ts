import { request } from '../client'
import type { QueryParams } from '../queryString'
import type {
  OrganizationScope,
  OrganizationScopeCreateRequest,
  OrganizationScopePage,
  OrganizationScopeUpdateRequest,
} from '../types'

export interface ListOrganizationScopesParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  type?: 'BRANCH' | 'STORE' | 'TRAINING_PROGRAM'
}

export function listOrganizationScopes(
  params: ListOrganizationScopesParams = {},
  signal?: AbortSignal,
): Promise<OrganizationScopePage> {
  return request<OrganizationScopePage>('/organization-scopes', { method: 'GET', query: params, signal })
}

export function createOrganizationScope(
  payload: OrganizationScopeCreateRequest,
  signal?: AbortSignal,
): Promise<OrganizationScope> {
  return request<OrganizationScope>('/organization-scopes', { method: 'POST', body: payload, signal })
}

export function updateOrganizationScope(
  scopeId: string,
  payload: OrganizationScopeUpdateRequest,
  signal?: AbortSignal,
): Promise<OrganizationScope> {
  return request<OrganizationScope>(`/organization-scopes/${scopeId}`, { method: 'PATCH', body: payload, signal })
}

import { request } from '../client'
import type { QueryParams } from '../queryString'
import type {
  RoleAssignmentRequest,
  ScopeAssignmentRequest,
  User,
  UserCreateRequest,
  UserPage,
  UserUpdateRequest,
} from '../types'

export interface ListUsersParams extends QueryParams {
  page?: number
  pageSize?: number
  sort?: string
  q?: string
  role?: string
  status?: 'ACTIVE' | 'DISABLED'
  organizationScopeId?: string
}

export function listUsers(params: ListUsersParams = {}, signal?: AbortSignal): Promise<UserPage> {
  return request<UserPage>('/users', { method: 'GET', query: params, signal })
}

export function createUser(payload: UserCreateRequest, signal?: AbortSignal): Promise<User> {
  return request<User>('/users', { method: 'POST', body: payload, signal })
}

export function getUser(userId: string, signal?: AbortSignal): Promise<User> {
  return request<User>(`/users/${userId}`, { method: 'GET', signal })
}

export function updateUser(userId: string, payload: UserUpdateRequest, signal?: AbortSignal): Promise<User> {
  return request<User>(`/users/${userId}`, { method: 'PATCH', body: payload, signal })
}

export function replaceUserRoles(userId: string, payload: RoleAssignmentRequest, signal?: AbortSignal): Promise<User> {
  return request<User>(`/users/${userId}/roles`, { method: 'PUT', body: payload, signal })
}

export function replaceUserOrganizationScopes(
  userId: string,
  payload: ScopeAssignmentRequest,
  signal?: AbortSignal,
): Promise<User> {
  return request<User>(`/users/${userId}/organization-scopes`, { method: 'PUT', body: payload, signal })
}

import { request } from '../client'
import type { RoleList } from '../types'

export function listRoles(signal?: AbortSignal): Promise<RoleList> {
  return request<RoleList>('/roles', { method: 'GET', signal })
}

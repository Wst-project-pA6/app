import { request } from '../client'
import type { Locale } from '../types'

/**
 * `POST /auth/register` is an approved additive endpoint agreed with the
 * backend team but not present in the frozen OpenAPI contract, so it is
 * hand-typed here rather than generated. Keep this file the single place
 * that knows its shape.
 *
 * Registration never returns tokens and never signs the caller in — a new
 * account starts with no roles or organization scopes until an
 * administrator assigns them (see PendingAccessPage), so the response body
 * is not modeled beyond "request accepted".
 */
export interface RegisterRequest {
  displayName: string
  email: string
  preferredLocale: Locale
  password: string
}

export function registerUser(payload: RegisterRequest, signal?: AbortSignal): Promise<void> {
  return request<void>('/auth/register', {
    method: 'POST',
    body: payload,
    anonymous: true,
    skipAuthRefresh: true,
    signal,
  })
}

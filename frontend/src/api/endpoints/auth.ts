import { request } from '../client'
import type { ChangePasswordRequest, CurrentUser, LoginRequest, LogoutRequest, TokenPair } from '../types'

export function login(payload: LoginRequest, signal?: AbortSignal): Promise<TokenPair> {
  return request<TokenPair>('/auth/login', {
    method: 'POST',
    body: payload,
    anonymous: true,
    skipAuthRefresh: true,
    signal,
  })
}

export function logout(payload: LogoutRequest, signal?: AbortSignal): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST', body: payload, skipAuthRefresh: true, signal })
}

export function changePassword(payload: ChangePasswordRequest, signal?: AbortSignal): Promise<void> {
  return request<void>('/auth/change-password', { method: 'POST', body: payload, signal })
}

export function getCurrentUser(signal?: AbortSignal): Promise<CurrentUser> {
  return request<CurrentUser>('/auth/me', { method: 'GET', signal })
}

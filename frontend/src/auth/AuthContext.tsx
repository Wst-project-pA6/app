import { createContext } from 'react'
import type { CurrentUser } from '@/api/types'
import type { ApiError } from '@/api/errors'

export type AuthStatus = 'restoring' | 'authenticated' | 'unauthenticated'

export interface LoginResult {
  mustChangePassword: boolean
}

export interface AuthContextValue {
  status: AuthStatus
  user: CurrentUser | null
  error: ApiError | null
  login: (email: string, password: string) => Promise<LoginResult>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
  /** Re-fetches /auth/me, e.g. after an administrator assigns roles/scopes to a pending account. */
  refreshUser: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

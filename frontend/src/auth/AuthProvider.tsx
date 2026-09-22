import type { ReactNode } from 'react'
import { useCallback, useEffect, useReducer } from 'react'
import * as authApi from '@/api/endpoints/auth'
import { refreshOnce } from '@/api/client'
import { ApiError } from '@/api/errors'
import { onSessionExpired } from '@/api/sessionEvents'
import { tokenStorage } from '@/api/tokenStorage'
import type { CurrentUser } from '@/api/types'
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext'

interface State {
  status: AuthStatus
  user: CurrentUser | null
  error: ApiError | null
}

type Action =
  | { type: 'AUTHENTICATED'; user: CurrentUser }
  | { type: 'UNAUTHENTICATED' }
  | { type: 'ERROR'; error: ApiError }
  | { type: 'CLEAR_ERROR' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'AUTHENTICATED':
      return { status: 'authenticated', user: action.user, error: null }
    case 'UNAUTHENTICATED':
      return { status: 'unauthenticated', user: null, error: state.error }
    case 'ERROR':
      return { ...state, error: action.error }
    case 'CLEAR_ERROR':
      return { ...state, error: null }
    default:
      return state
  }
}

function toApiError(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause
  return new ApiError({ message: 'Unexpected error', code: 'UNKNOWN_ERROR', status: 0 })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    status: 'restoring',
    user: null,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function restore() {
      if (!tokenStorage.getRefreshToken()) {
        if (!cancelled) dispatch({ type: 'UNAUTHENTICATED' })
        return
      }

      try {
        // Shared with the API client's 401-retry path (see refreshOnce in
        // api/client.ts) so a StrictMode double-invocation of this effect —
        // or any other concurrent trigger — awaits one real refresh call
        // instead of two racing for the same single-use refresh token.
        await refreshOnce()
        const user = await authApi.getCurrentUser()
        if (!cancelled) dispatch({ type: 'AUTHENTICATED', user })
      } catch {
        tokenStorage.clear()
        if (!cancelled) dispatch({ type: 'UNAUTHENTICATED' })
      }
    }

    void restore()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return onSessionExpired(() => {
      dispatch({ type: 'UNAUTHENTICATED' })
    })
  }, [])

  const login = useCallback<AuthContextValue['login']>(async (email, password) => {
    dispatch({ type: 'CLEAR_ERROR' })
    try {
      const tokenPair = await authApi.login({ email, password })
      tokenStorage.setAccessToken(tokenPair.accessToken)
      tokenStorage.setRefreshToken(tokenPair.refreshToken)
      const user = await authApi.getCurrentUser()
      dispatch({ type: 'AUTHENTICATED', user })
      return { mustChangePassword: user.mustChangePassword }
    } catch (cause) {
      const apiError = toApiError(cause)
      dispatch({ type: 'ERROR', error: apiError })
      throw apiError
    }
  }, [])

  const changePassword = useCallback<AuthContextValue['changePassword']>(async (currentPassword, newPassword) => {
    dispatch({ type: 'CLEAR_ERROR' })
    try {
      await authApi.changePassword({ currentPassword, newPassword })
      const user = await authApi.getCurrentUser()
      dispatch({ type: 'AUTHENTICATED', user })
    } catch (cause) {
      const apiError = toApiError(cause)
      dispatch({ type: 'ERROR', error: apiError })
      throw apiError
    }
  }, [])

  const logout = useCallback<AuthContextValue['logout']>(async () => {
    const refreshToken = tokenStorage.getRefreshToken()
    try {
      if (refreshToken) {
        await authApi.logout({ refreshToken })
      }
    } catch {
      // Logout is best-effort client-side; tokens are cleared regardless.
    } finally {
      tokenStorage.clear()
      dispatch({ type: 'UNAUTHENTICATED' })
    }
  }, [])

  const clearError = useCallback(() => dispatch({ type: 'CLEAR_ERROR' }), [])

  const refreshUser = useCallback<AuthContextValue['refreshUser']>(async () => {
    try {
      const user = await authApi.getCurrentUser()
      dispatch({ type: 'AUTHENTICATED', user })
    } catch (cause) {
      dispatch({ type: 'ERROR', error: toApiError(cause) })
    }
  }, [])

  const value: AuthContextValue = {
    status: state.status,
    user: state.user,
    error: state.error,
    login,
    changePassword,
    logout,
    clearError,
    refreshUser,
  }

  return <AuthContext value={value}>{children}</AuthContext>
}

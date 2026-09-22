import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { LoadingIndicator } from '@/components'
import { useTranslation } from 'react-i18next'
import { useAuth } from './useAuth'

/**
 * Requires only that the user be authenticated. Redirects to /login,
 * preserving the originally requested location so login can navigate back
 * to it. Also redirects to the forced change-password page when the
 * account still has mustChangePassword set.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'restoring') {
    return <LoadingIndicator label={t('auth.restoring')} />
  }

  if (status === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace state={{ from: location }} />
  }

  const isPending = user.roles.length === 0 && user.permissions.length === 0
  if (isPending && location.pathname !== '/pending-access') {
    return <Navigate to="/pending-access" replace />
  }

  return <>{children}</>
}

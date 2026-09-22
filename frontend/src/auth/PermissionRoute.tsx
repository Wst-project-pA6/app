import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import type { Permission } from '@/api/types'
import { ProtectedRoute } from './ProtectedRoute'
import { hasAnyPermission } from './permissions'
import { useAuth } from './useAuth'

export interface PermissionRouteProps {
  /** ANY-OF: the user needs at least one of these permissions. Empty means authenticated-only. */
  anyOf: ReadonlyArray<Permission>
  children: ReactNode
}

/**
 * Requires authentication (delegated to ProtectedRoute) plus at least one
 * permission from `anyOf`, matching the backend's ANY-OF authorization
 * semantics. This is convenience UI gating only — the backend re-checks
 * every request.
 */
export function PermissionRoute({ anyOf, children }: PermissionRouteProps) {
  return (
    <ProtectedRoute>
      <PermissionGate anyOf={anyOf}>{children}</PermissionGate>
    </ProtectedRoute>
  )
}

/** Permission check only (no auth redirect) — use inside a subtree already wrapped by ProtectedRoute. */
export function PermissionGate({ anyOf, children }: PermissionRouteProps) {
  const { user } = useAuth()

  if (!hasAnyPermission(user, anyOf)) {
    return <Navigate to="/forbidden" replace />
  }

  return <>{children}</>
}

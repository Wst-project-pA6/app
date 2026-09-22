import type { CurrentUser, Permission } from '@/api/types'

/**
 * The backend's authorization model is ANY-OF: `x-permissions` on an
 * operation lists permissions of which the caller needs just one. This
 * mirrors that semantics for UI-visibility decisions. An empty
 * `requiredPermissions` list means "authenticated only" and is always
 * satisfied.
 *
 * This is a convenience for hiding/showing UI. It is never authoritative —
 * the backend re-checks every request from the JWT identity, never from
 * client claims.
 */
export function hasAnyPermission(user: CurrentUser | null, requiredPermissions: ReadonlyArray<Permission>): boolean {
  if (!user) return false
  if (requiredPermissions.length === 0) return true
  const granted = new Set(user.permissions)
  return requiredPermissions.some((permission) => granted.has(permission))
}

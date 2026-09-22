/**
 * Minimal pub/sub so the API client (which must not import the auth React
 * context, to avoid a circular dependency) can notify the app that the
 * session has been invalidated — e.g. refresh failed, or the refresh token
 * was rejected. AuthProvider subscribes to this to clear its in-memory user
 * state and redirect to login.
 */
type Listener = () => void

const listeners = new Set<Listener>()

export function onSessionExpired(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function notifySessionExpired(): void {
  for (const listener of listeners) listener()
}

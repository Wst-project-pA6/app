/**
 * Intersects the caller's own allowed organization scopes with an optional `organizationScopeId`
 * filter. Mirrors how every other list endpoint in this codebase applies row scope (e.g.
 * `j.organization_scope_id = ANY($1::uuid[])` in jobs.repository.ts): scope is never widened by
 * a request parameter. If the caller asks for a scope they do not hold, the result is an empty
 * array — every dashboard metric and export then legitimately computes to zero/empty rows rather
 * than leaking data or throwing, the same "safe empty result" behavior ScopeService's callers
 * rely on elsewhere.
 */
export function resolveScopeIds(requestedScopeId: string | undefined, allowedScopeIds: string[]): string[] {
  if (!requestedScopeId) return allowedScopeIds;
  return allowedScopeIds.includes(requestedScopeId) ? [requestedScopeId] : [];
}

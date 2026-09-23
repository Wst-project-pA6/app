import { createHash } from 'node:crypto';

export interface FingerprintFilters {
  from?: string;
  to?: string;
  organizationScopeId?: string;
  storeId?: string;
  bayId?: string;
  technicianId?: string;
  courseId?: string;
  termId?: string;
}

/**
 * Deterministic hash of the effective filters plus the caller's resolved organization scope —
 * backs DashboardResponse.filterFingerprint and ExportJob.filterFingerprint (both CHAR(64) sha256
 * hex in the schema). Equal fingerprints mean two calls are reconcilable per the OpenAPI
 * contract's dashboard<->export rule, so this must be a pure function of (filters, scopeIds)
 * only — never of wall-clock time, row data, or caller identity beyond scope.
 */
export function computeFilterFingerprint(filters: FingerprintFilters, scopeIds: string[]): string {
  const canonical = {
    from: filters.from ?? null,
    to: filters.to ?? null,
    organizationScopeId: filters.organizationScopeId ?? null,
    storeId: filters.storeId ?? null,
    bayId: filters.bayId ?? null,
    technicianId: filters.technicianId ?? null,
    courseId: filters.courseId ?? null,
    termId: filters.termId ?? null,
    scope: [...new Set(scopeIds)].sort(),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

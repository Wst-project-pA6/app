export type QueryValue = string | number | boolean | undefined | null | ReadonlyArray<string | number>

export type QueryParams = Record<string, QueryValue>

/**
 * Builds a query string matching the contract's collection conventions:
 * `page`, `pageSize`, `sort` and typed filters. Array values are serialized
 * as a single comma-separated parameter (OpenAPI `style: form, explode:
 * false`), which is how this contract's repeated filter values are
 * represented. `undefined`/`null`/empty-array values are omitted entirely
 * rather than sent as empty strings.
 */
export function toQueryString(params: QueryParams): string {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue

    if (Array.isArray(value)) {
      if (value.length === 0) continue
      search.set(key, value.join(','))
      continue
    }

    search.set(key, String(value))
  }

  const serialized = search.toString()
  return serialized ? `?${serialized}` : ''
}

import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * Binds one URL query parameter to component state, so list filters and
 * sort survive navigation and reloads. Setting a value other than `page`
 * resets `page` back to the first page, matching how every list page here
 * treats a filter change.
 */
export function useSearchParamState(key: string, defaultValue = '') {
  const [searchParams, setSearchParams] = useSearchParams()
  const value = searchParams.get(key) ?? defaultValue

  const setValue = useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const updated = new URLSearchParams(prev)
          if (!next) {
            updated.delete(key)
          } else {
            updated.set(key, next)
          }
          if (key !== 'page') {
            updated.delete('page')
          }
          return updated
        },
        { replace: true },
      )
    },
    [key, setSearchParams],
  )

  return [value, setValue] as const
}

/** Same as `useSearchParamState` but for the `page` parameter, which never resets itself. */
export function useSearchParamPage(defaultValue = 1) {
  const [searchParams, setSearchParams] = useSearchParams()
  const raw = searchParams.get('page')
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue

  const setValue = useCallback(
    (next: number) => {
      setSearchParams(
        (prev) => {
          const updated = new URLSearchParams(prev)
          updated.set('page', String(next))
          return updated
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  return [value, setValue] as const
}

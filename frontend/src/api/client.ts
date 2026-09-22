import i18n from '@/i18n'
import { ApiError } from './errors'
import { notifySessionExpired } from './sessionEvents'
import { tokenStorage } from './tokenStorage'
import type { QueryParams } from './queryString'
import { toQueryString } from './queryString'
import type { ApiErrorBody, RefreshRequest, TokenPair } from './types'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/+$/, '')

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: QueryParams
  body?: unknown
  signal?: AbortSignal
  headers?: Record<string, string>
  /** Skip the Authorization header (public endpoints). */
  anonymous?: boolean
  /**
   * Internal: disables the 401-refresh-and-retry flow. Must be true for
   * /auth/login, /auth/refresh and /auth/logout so a failing auth call can
   * never trigger a recursive refresh attempt.
   */
  skipAuthRefresh?: boolean
}

let refreshInFlight: Promise<TokenPair> | null = null

async function performRefresh(): Promise<TokenPair> {
  const refreshToken = tokenStorage.getRefreshToken()
  if (!refreshToken) {
    throw new ApiError({ message: 'No refresh token available', code: 'UNAUTHENTICATED', status: 401 })
  }

  const body: RefreshRequest = { refreshToken }
  const tokenPair = await request<TokenPair>('/auth/refresh', {
    method: 'POST',
    body,
    anonymous: true,
    skipAuthRefresh: true,
  })

  tokenStorage.setAccessToken(tokenPair.accessToken)
  tokenStorage.setRefreshToken(tokenPair.refreshToken)
  return tokenPair
}

/**
 * Ensures only one refresh request is ever in flight at a time. Concurrent
 * 401s — and AuthProvider's own restore-on-mount, which calls this too —
 * all await the same promise instead of each firing their own refresh call
 * (which would race the single-use refresh token: the loser gets a 401 from
 * the backend and, unless it shares this guard, would wipe out the tokens
 * the winner just stored).
 */
export function refreshOnce(): Promise<TokenPair> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

function buildUrl(path: string, query?: QueryParams): string {
  const suffix = query ? toQueryString(query) : ''
  return `${API_BASE_URL}${path}${suffix}`
}

async function parseErrorBody(response: Response): Promise<ApiErrorBody | undefined> {
  try {
    const parsed = (await response.json()) as unknown
    if (parsed && typeof parsed === 'object' && 'code' in parsed && 'message' in parsed) {
      return parsed as ApiErrorBody
    }
    return undefined
  } catch {
    return undefined
  }
}

function retryAfterFromHeader(response: Response): number | undefined {
  const header = response.headers.get('Retry-After')
  if (!header) return undefined
  const seconds = Number(header)
  return Number.isFinite(seconds) ? seconds : undefined
}

async function toApiError(response: Response): Promise<ApiError> {
  const retryAfterSeconds = retryAfterFromHeader(response)
  const body = await parseErrorBody(response)

  if (body) {
    return ApiError.fromBody(response.status, body, retryAfterSeconds)
  }

  return new ApiError({
    message: `Request failed with status ${response.status}`,
    code: response.status === 401 ? 'UNAUTHENTICATED' : 'UNKNOWN_ERROR',
    status: response.status,
    retryAfterSeconds,
  })
}

/**
 * Core typed request function. Attaches the bearer access token (unless
 * `anonymous`), the negotiated Accept-Language header, serializes the JSON
 * body, and parses the response per the contract: JSON bodies, 204 No
 * Content, and the standard `Error` shape on failure.
 *
 * On a 401 from a non-anonymous, non-skipAuthRefresh request, attempts a
 * single shared token refresh and retries the original request exactly
 * once. If the refresh itself fails, the session is cleared and a
 * session-expired event is emitted for the auth provider to react to.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, signal, headers = {}, anonymous = false, skipAuthRefresh = false } = options

  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': i18n.language === 'ar' ? 'ar' : 'en',
    ...headers,
  }

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData

  if (body !== undefined && !isFormData) {
    requestHeaders['Content-Type'] = 'application/json'
  }
  // FormData bodies (multipart uploads) must never get an explicit
  // Content-Type: the browser sets it, including the multipart boundary.

  if (!anonymous) {
    const accessToken = tokenStorage.getAccessToken()
    if (accessToken) {
      requestHeaders.Authorization = `Bearer ${accessToken}`
    }
  }

  const serializedBody: BodyInit | undefined = body === undefined ? undefined : isFormData ? body : JSON.stringify(body)

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: requestHeaders,
      body: serializedBody,
      signal,
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw cause
    }
    throw new ApiError({ message: 'Network request failed', code: 'NETWORK_ERROR', status: 0 })
  }

  if (response.status === 401 && !anonymous && !skipAuthRefresh) {
    try {
      await refreshOnce()
    } catch {
      tokenStorage.clear()
      notifySessionExpired()
      throw await toApiError(response)
    }

    const retryHeaders = { ...requestHeaders }
    const accessToken = tokenStorage.getAccessToken()
    if (accessToken) {
      retryHeaders.Authorization = `Bearer ${accessToken}`
    }

    let retryResponse: Response
    try {
      retryResponse = await fetch(buildUrl(path, query), {
        method,
        headers: retryHeaders,
        body: serializedBody,
        signal,
      })
    } catch {
      throw new ApiError({ message: 'Network request failed', code: 'NETWORK_ERROR', status: 0 })
    }

    if (!retryResponse.ok) {
      if (retryResponse.status === 401) {
        tokenStorage.clear()
        notifySessionExpired()
      }
      throw await toApiError(retryResponse)
    }

    return parseSuccess<T>(retryResponse)
  }

  if (!response.ok) {
    throw await toApiError(response)
  }

  return parseSuccess<T>(response)
}

async function parseSuccess<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  if (!text) {
    return undefined as T
  }

  return JSON.parse(text) as T
}

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from './client'
import { ApiError } from './errors'
import { onSessionExpired } from './sessionEvents'
import { tokenStorage } from './tokenStorage'

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function noContentResponse() {
  return new Response(null, { status: 204 })
}

describe('api client', () => {
  beforeEach(() => {
    tokenStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('parses a successful JSON response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { hello: 'world' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await request<{ hello: string }>('/health', { anonymous: true })

    expect(result).toEqual({ hello: 'world' })
  })

  it('returns undefined for a 204 No Content response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(noContentResponse())
    vi.stubGlobal('fetch', fetchMock)

    const result = await request<void>('/auth/logout', {
      method: 'POST',
      body: { refreshToken: 'abcdefghijklmnopqrst' },
      skipAuthRefresh: true,
    })

    expect(result).toBeUndefined()
  })

  it('throws a structured ApiError for a non-2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(422, {
        code: 'VALIDATION_FAILED',
        message: 'Invalid payload',
        requestId: 'req-123',
        details: [{ field: '/email', code: 'REQUIRED', message: 'Required' }],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      request('/auth/login', { method: 'POST', body: {}, anonymous: true, skipAuthRefresh: true }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      status: 422,
      requestId: 'req-123',
    })
  })

  it('captures Retry-After on a 429 response', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          429,
          { code: 'RATE_LIMITED', message: 'Too many requests', requestId: 'req-9' },
          { 'Retry-After': '30' },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    try {
      await request('/auth/login', { method: 'POST', body: {}, anonymous: true, skipAuthRefresh: true })
      throw new Error('expected request to reject')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).retryAfterSeconds).toBe(30)
    }
  })

  it('attaches the bearer access token when one is stored', async () => {
    tokenStorage.setAccessToken('access-token-123')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await request('/users', {})

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer access-token-123')
  })

  it('does not attach a token for anonymous requests', async () => {
    tokenStorage.setAccessToken('access-token-123')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await request('/auth/login', { method: 'POST', body: {}, anonymous: true, skipAuthRefresh: true })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('runs only one refresh for several concurrent 401s, then retries each request once', async () => {
    tokenStorage.setAccessToken('stale-token')
    tokenStorage.setRefreshToken('a-valid-refresh-token-value')

    let refreshCalls = 0
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1
        return Promise.resolve(
          jsonResponse(200, {
            accessToken: 'new-token',
            refreshToken: 'new-refresh',
            tokenType: 'Bearer',
            expiresIn: 900,
            mustChangePassword: false,
          }),
        )
      }
      if (url.includes('/protected')) {
        const isRetry =
          fetchMock.mock.calls.filter(([callUrl]) => (callUrl as string).includes('/protected')).length > 1
        return Promise.resolve(
          isRetry
            ? jsonResponse(200, { ok: true })
            : jsonResponse(401, { code: 'TOKEN_EXPIRED', message: 'Expired', requestId: 'r1' }),
        )
      }
      throw new Error(`Unexpected URL ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const results = await Promise.all([request('/protected'), request('/protected'), request('/protected')])

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }])
    expect(refreshCalls).toBe(1)
    expect(tokenStorage.getAccessToken()).toBe('new-token')
  })

  it('clears the session and notifies listeners when refresh itself fails', async () => {
    tokenStorage.setAccessToken('stale-token')
    tokenStorage.setRefreshToken('an-expired-refresh-token-value')

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/auth/refresh')) {
        return Promise.resolve(
          jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'Refresh token invalid', requestId: 'r2' }),
        )
      }
      return Promise.resolve(jsonResponse(401, { code: 'TOKEN_EXPIRED', message: 'Expired', requestId: 'r1' }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const sessionExpired = vi.fn()
    const unsubscribe = onSessionExpired(sessionExpired)

    await expect(request('/protected')).rejects.toMatchObject({ status: 401 })

    expect(sessionExpired).toHaveBeenCalledTimes(1)
    expect(tokenStorage.getAccessToken()).toBeNull()
    expect(tokenStorage.getRefreshToken()).toBeNull()

    unsubscribe()
  })

  it('never attempts a refresh for the login, refresh or logout endpoints themselves', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(401, { code: 'INVALID_CREDENTIALS', message: 'Bad credentials', requestId: 'r3' }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      request('/auth/login', { method: 'POST', body: {}, anonymous: true, skipAuthRefresh: true }),
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

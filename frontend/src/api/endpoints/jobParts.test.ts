import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { issuePart, reservePart } from './jobParts'
import { tokenStorage } from '../tokenStorage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('job parts endpoints', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('issues a part with the exact request shape and an Idempotency-Key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'pi1' }))
    vi.stubGlobal('fetch', fetchMock)

    await issuePart('j1', { partId: 'p1', storeId: 's1', quantity: 2 }, 'idem-key-1')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/job-cards/j1/part-issues')
    expect(JSON.parse(init.body as string)).toEqual({ partId: 'p1', storeId: 's1', quantity: 2 })
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('idem-key-1')
  })

  it('reserves a part with the exact request shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'pr1' }))
    vi.stubGlobal('fetch', fetchMock)

    await reservePart('j1', { partId: 'p1', storeId: 's1', quantity: 5 }, 'idem-key-2')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/job-cards/j1/part-reservations')
    expect(JSON.parse(init.body as string)).toEqual({ partId: 'p1', storeId: 's1', quantity: 5 })
  })
})

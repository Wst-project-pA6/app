import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getBayCalendar, listBays } from './bays'
import { tokenStorage } from '../tokenStorage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('bays endpoints', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('builds the list query string from page/filter params', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { items: [], page: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await listBays({ page: 1, pageSize: 20, sort: 'code', status: 'MAINTENANCE' })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/bays?')
    expect(url).toContain('sort=code')
    expect(url).toContain('status=MAINTENANCE')
  })

  it('sends the required from/to RFC3339 query on the calendar request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { bayId: 'b1', from: '', to: '', entries: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await getBayCalendar('b1', { from: '2026-01-01T00:00:00.000Z', to: '2026-01-08T00:00:00.000Z' })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/bays/b1/calendar?')
    expect(url).toContain(`from=${encodeURIComponent('2026-01-01T00:00:00.000Z')}`)
    expect(url).toContain(`to=${encodeURIComponent('2026-01-08T00:00:00.000Z')}`)
  })
})

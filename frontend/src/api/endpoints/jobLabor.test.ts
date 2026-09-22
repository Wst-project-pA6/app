import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLaborEntry, voidLaborEntry } from './jobLabor'
import { tokenStorage } from '../tokenStorage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('job labor endpoints', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('sends the exact LaborEntryCreateRequest shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'l1' }))
    vi.stubGlobal('fetch', fetchMock)

    await createLaborEntry('j1', { workDate: '2026-01-01', durationMinutes: 90 })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/job-cards/j1/labor-entries')
    expect(JSON.parse(init.body as string)).toEqual({ workDate: '2026-01-01', durationMinutes: 90 })
  })

  it('voids a labor entry with a required reason', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'l1', status: 'VOIDED' }))
    vi.stubGlobal('fetch', fetchMock)

    await voidLaborEntry('j1', 'l1', { reason: 'Logged against wrong job' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/job-cards/j1/labor-entries/l1/void')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ reason: 'Logged against wrong job' })
  })
})

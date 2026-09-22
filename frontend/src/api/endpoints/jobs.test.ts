import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assignJobCard, listJobCards, transitionJobCard } from './jobs'
import { tokenStorage } from '../tokenStorage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('jobs endpoints', () => {
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

    await listJobCards({ page: 1, pageSize: 20, sort: '-createdAt', stage: 'IN_PROGRESS', technicianId: 't1' })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/job-cards?')
    expect(url).toContain('stage=IN_PROGRESS')
    expect(url).toContain('technicianId=t1')
  })

  it('sends the exact JobAssignmentRequest shape via PUT', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'j1' }))
    vi.stubGlobal('fetch', fetchMock)

    await assignJobCard('j1', {
      version: 3,
      bayId: 'b1',
      technicianId: 't1',
      scheduledStartAt: '2026-01-01T08:00:00.000Z',
      expectedCompletionAt: '2026-01-01T12:00:00.000Z',
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/job-cards/j1/assignment')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({
      version: 3,
      bayId: 'b1',
      technicianId: 't1',
      scheduledStartAt: '2026-01-01T08:00:00.000Z',
      expectedCompletionAt: '2026-01-01T12:00:00.000Z',
    })
  })

  it('sends the exact JobTransitionRequest shape for a stage transition', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'j1', stage: 'IN_PROGRESS' }))
    vi.stubGlobal('fetch', fetchMock)

    await transitionJobCard('j1', { toStage: 'IN_PROGRESS', expectedFromStage: 'RECEIVED' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/job-cards/j1/transitions')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ toStage: 'IN_PROGRESS', expectedFromStage: 'RECEIVED' })
  })
})

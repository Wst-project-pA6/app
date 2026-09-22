import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJobApproval, createQualityCheck } from './jobApprovals'
import { tokenStorage } from '../tokenStorage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('job approvals and quality endpoints', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('sends the exact JobApprovalCreateRequest shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'a1' }))
    vi.stubGlobal('fetch', fetchMock)

    await createJobApproval('j1', { scope: 'INITIAL_WORK', description: 'Initial diagnosis and repair' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/job-cards/j1/approvals')
    expect(JSON.parse(init.body as string)).toEqual({
      scope: 'INITIAL_WORK',
      description: 'Initial diagnosis and repair',
    })
  })

  it('sends the exact QualityCheckCreateRequest shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'q1' }))
    vi.stubGlobal('fetch', fetchMock)

    await createQualityCheck('j1', { result: 'FAILED', notes: 'Brake pads not seated correctly' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/job-cards/j1/quality-checks')
    expect(JSON.parse(init.body as string)).toEqual({ result: 'FAILED', notes: 'Brake pads not seated correctly' })
  })
})

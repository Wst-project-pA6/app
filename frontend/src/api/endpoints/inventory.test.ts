import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStockAdjustment } from './inventory'
import { tokenStorage } from '../tokenStorage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('inventory endpoints', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('requests a stock adjustment with the exact shape and an Idempotency-Key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'adj1', status: 'PENDING_APPROVAL' }))
    vi.stubGlobal('fetch', fetchMock)

    await createStockAdjustment({ storeId: 's1', partId: 'p1', quantityDelta: -3, reasonCode: 'DAMAGE' }, 'idem-adj-1')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/stock-adjustments')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      storeId: 's1',
      partId: 'p1',
      quantityDelta: -3,
      reasonCode: 'DAMAGE',
    })
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('idem-adj-1')
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGoodsReceipt, createPurchaseOrder } from './purchasing'
import { tokenStorage } from '../tokenStorage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('purchasing endpoints', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('sends the exact PurchaseOrderCreateRequest shape with Money line costs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'po1' }))
    vi.stubGlobal('fetch', fetchMock)

    await createPurchaseOrder({
      vendorId: 'v1',
      storeId: 's1',
      lines: [{ partId: 'p1', quantityOrdered: 10, unitCost: { amount: '12.50', currency: 'USD' } }],
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/purchase-orders')
    expect(JSON.parse(init.body as string)).toEqual({
      vendorId: 'v1',
      storeId: 's1',
      lines: [{ partId: 'p1', quantityOrdered: 10, unitCost: { amount: '12.50', currency: 'USD' } }],
    })
  })

  it('posts a goods receipt with the exact line shape and an Idempotency-Key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'gr1' }))
    vi.stubGlobal('fetch', fetchMock)

    await createGoodsReceipt(
      'po1',
      {
        lines: [
          {
            purchaseOrderLineId: 'line1',
            quantityReceived: 10,
            quantityAccepted: 9,
            quantityRejected: 1,
            rejectionReason: 'Damaged in transit',
          },
        ],
      },
      'idem-gr-1',
    )

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/purchase-orders/po1/goods-receipts')
    expect(JSON.parse(init.body as string)).toEqual({
      lines: [
        {
          purchaseOrderLineId: 'line1',
          quantityReceived: 10,
          quantityAccepted: 9,
          quantityRejected: 1,
          rejectionReason: 'Damaged in transit',
        },
      ],
    })
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('idem-gr-1')
  })
})

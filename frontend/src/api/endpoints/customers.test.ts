import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCustomer, listCustomers } from './customers'
import { tokenStorage } from '../tokenStorage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('customers endpoints', () => {
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

    await listCustomers({
      page: 1,
      pageSize: 20,
      sort: 'displayName',
      q: 'acme',
      status: 'ACTIVE',
      phone: '+15551234567',
    })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/customers?')
    expect(url).toContain('sort=displayName')
    expect(url).toContain('q=acme')
    expect(url).toContain('status=ACTIVE')
    expect(url).toContain(encodeURIComponent('+15551234567'))
  })

  it('sends the exact CustomerCreateRequest fields, omitting unset optionals', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'c1' }))
    vi.stubGlobal('fetch', fetchMock)

    await createCustomer({
      organizationScopeId: 'scope-1',
      displayName: 'Acme Garage',
      type: 'BUSINESS',
      phone: '+15551234567',
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      organizationScopeId: 'scope-1',
      displayName: 'Acme Garage',
      type: 'BUSINESS',
      phone: '+15551234567',
    })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServiceReminder, createVehicle, listVehicles, updateServiceReminder } from './vehicles'
import { tokenStorage } from '../tokenStorage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('vehicles endpoints', () => {
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

    await listVehicles({
      page: 1,
      pageSize: 20,
      sort: 'plate',
      plate: 'ABC123',
      vin: '1HGCM82633A004352',
      status: 'ACTIVE',
    })

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/vehicles?')
    expect(url).toContain('sort=plate')
    expect(url).toContain('plate=ABC123')
    expect(url).toContain('vin=1HGCM82633A004352')
    expect(url).toContain('status=ACTIVE')
  })

  it('sends the exact VehicleCreateRequest fields on create', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'v1' }))
    vi.stubGlobal('fetch', fetchMock)

    await createVehicle({
      customerId: 'c1',
      plate: 'ABC123',
      vin: '1HGCM82633A004352',
      make: 'Honda',
      model: 'Accord',
      year: 2020,
      mileage: 15000,
      mileageUnit: 'KM',
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      customerId: 'c1',
      plate: 'ABC123',
      vin: '1HGCM82633A004352',
      make: 'Honda',
      model: 'Accord',
      year: 2020,
      mileage: 15000,
      mileageUnit: 'KM',
    })
  })

  it('creates a reminder with only the provided due fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'r1' }))
    vi.stubGlobal('fetch', fetchMock)

    await createServiceReminder('v1', { title: 'Oil change', dueMileage: 20000 })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/vehicles/v1/reminders')
    expect(JSON.parse(init.body as string)).toEqual({ title: 'Oil change', dueMileage: 20000 })
  })

  it('transitions a reminder to a terminal status via PATCH', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'r1', status: 'DONE' }))
    vi.stubGlobal('fetch', fetchMock)

    await updateServiceReminder('r1', { status: 'DONE' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/service-reminders/r1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ status: 'DONE' })
  })
})

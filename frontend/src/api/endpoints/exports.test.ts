import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tokenStorage } from '../tokenStorage'
import { authorizeExportDownload, createExportJob } from './exports'

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
describe('export lifecycle endpoints', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })
  it('creates a contract-shaped async export and authorizes its download', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(202, { id: 'ex1', status: 'PENDING' }))
      .mockResolvedValueOnce(response(201, { url: 'https://download.example/ex1', expiresAt: '2026-09-01T00:05:00Z' }))
    vi.stubGlobal('fetch', fetchMock)
    await createExportJob({ exportType: 'INVOICES', format: 'CSV', filters: { from: '2026-09-01T00:00:00Z' } })
    await authorizeExportDownload('ex1')
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      exportType: 'INVOICES',
      format: 'CSV',
      filters: { from: '2026-09-01T00:00:00Z' },
    })
    expect(fetchMock.mock.calls[1][0]).toContain('/exports/ex1/download-authorizations')
  })
})

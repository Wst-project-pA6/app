import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authorizeAttachmentDownload, uploadAttachment } from './attachments'
import { tokenStorage } from '../tokenStorage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('attachments endpoints', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('uploads a file as multipart FormData without a Content-Type header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'att1', fileName: 'photo.jpg' }))
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(['binary-content'], 'photo.jpg', { type: 'image/jpeg' })
    await uploadAttachment(file, 'JOB_PHOTO')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/attachments')
    expect(init.body).toBeInstanceOf(FormData)
    const body = init.body as FormData
    expect(body.get('purpose')).toBe('JOB_PHOTO')
    expect((body.get('file') as File).name).toBe('photo.jpg')
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('requests a short-lived download authorization', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(201, { url: 'https://example.com/signed', expiresAt: '2026-01-01T00:05:00.000Z' }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await authorizeAttachmentDownload('att1')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/attachments/att1/download-authorizations')
    expect(init.method).toBe('POST')
    expect(result.url).toBe('https://example.com/signed')
  })
})

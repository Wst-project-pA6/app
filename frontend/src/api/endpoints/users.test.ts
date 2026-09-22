import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUser, listUsers, replaceUserOrganizationScopes, replaceUserRoles } from './users'
import { tokenStorage } from '../tokenStorage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('users endpoints', () => {
  beforeEach(() => {
    tokenStorage.clear()
  })

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

    await listUsers({ page: 2, pageSize: 20, sort: '-createdAt', q: 'ada', role: 'SERVICE_ADVISOR', status: 'ACTIVE' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/users?')
    expect(url).toContain('page=2')
    expect(url).toContain('pageSize=20')
    expect(url).toContain('sort=-createdAt')
    expect(url).toContain('q=ada')
    expect(url).toContain('role=SERVICE_ADVISOR')
    expect(url).toContain('status=ACTIVE')
    expect(init.method).toBe('GET')
  })

  it('sends the exact UserCreateRequest fields on create', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'u1' }))
    vi.stubGlobal('fetch', fetchMock)

    await createUser({
      email: 'a@example.edu',
      displayName: 'Ada',
      preferredLocale: 'en',
      temporaryPassword: 'Sw0rdfish!',
    })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/users')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'a@example.edu',
      displayName: 'Ada',
      preferredLocale: 'en',
      temporaryPassword: 'Sw0rdfish!',
    })
  })

  it('replaces roles via PUT with a {roles} body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'u1' }))
    vi.stubGlobal('fetch', fetchMock)

    await replaceUserRoles('u1', { roles: ['SERVICE_ADVISOR', 'TECHNICIAN'] })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/users/u1/roles')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ roles: ['SERVICE_ADVISOR', 'TECHNICIAN'] })
  })

  it('replaces organization scopes via PUT with an {organizationScopeIds} body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: 'u1' }))
    vi.stubGlobal('fetch', fetchMock)

    await replaceUserOrganizationScopes('u1', { organizationScopeIds: ['scope-1', 'scope-2'] })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/users/u1/organization-scopes')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ organizationScopeIds: ['scope-1', 'scope-2'] })
  })
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { CurrentUser } from '@/api/types'
import { AuthContext, type AuthContextValue } from '@/auth/AuthContext'
import { tokenStorage } from '@/api/tokenStorage'
import { UserListPage } from './UserListPage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const userPage = {
  items: [
    {
      id: 'u1',
      email: 'ada@example.edu',
      displayName: 'Ada Advisor',
      preferredLocale: 'en',
      status: 'ACTIVE',
      roles: ['SERVICE_ADVISOR'],
      organizationScopeIds: [],
      mustChangePassword: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'sys',
      updatedBy: 'sys',
    },
  ],
  page: { page: 1, pageSize: 20, totalItems: 40, totalPages: 2 },
}

const baseUser: CurrentUser = {
  id: 'current-1',
  email: 'me@example.edu',
  displayName: 'Current User',
  preferredLocale: 'en',
  roles: ['SERVICE_ADVISOR'],
  permissions: ['users.read'],
  organizationScopeIds: [],
  mustChangePassword: false,
}

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: 'authenticated',
    user: baseUser,
    error: null,
    login: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
    clearError: vi.fn(),
    refreshUser: vi.fn(),
    ...overrides,
  }
}

function renderPage(user: CurrentUser, fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/access/users']}>
        <AuthContext value={authValue({ user })}>
          <UserListPage />
        </AuthContext>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function makeFetchMock() {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('/users?') || url.endsWith('/users')) return Promise.resolve(jsonResponse(200, userPage))
    if (url.includes('/roles')) return Promise.resolve(jsonResponse(200, { items: [] }))
    if (url.includes('/organization-scopes')) {
      return Promise.resolve(
        jsonResponse(200, { items: [], page: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 } }),
      )
    }
    return Promise.reject(new Error(`Unexpected URL ${url}`))
  })
}

describe('UserListPage', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('requests the default-sorted first page and renders the returned users', async () => {
    const fetchMock = makeFetchMock()
    renderPage(baseUser, fetchMock)

    expect(await screen.findByText('Ada Advisor')).toBeInTheDocument()

    const usersCall = fetchMock.mock.calls.find(([url]) => (url as string).includes('/users?'))
    expect(usersCall?.[0]).toContain('sort=-createdAt')
    expect(usersCall?.[0]).toContain('page=1')
  })

  it('hides the create action for a user without users.manage', async () => {
    renderPage(baseUser, makeFetchMock())
    await screen.findByText('Ada Advisor')
    expect(screen.queryByText('New user')).not.toBeInTheDocument()
  })

  it('shows the create action for a user with users.manage', async () => {
    renderPage({ ...baseUser, permissions: ['users.read', 'users.manage'] }, makeFetchMock())
    await screen.findByText('Ada Advisor')
    expect(screen.getByText('New user')).toBeInTheDocument()
  })

  it('re-fetches with the status filter applied when the filter changes', async () => {
    const fetchMock = makeFetchMock()
    renderPage(baseUser, fetchMock)
    await screen.findByText('Ada Advisor')

    const statusSelect = screen.getByLabelText('Status')
    await userEvent.selectOptions(statusSelect, 'DISABLED')

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => (url as string).includes('status=DISABLED'))
      expect(call).toBeDefined()
    })
  })

  it('re-fetches the next page when pagination advances', async () => {
    const fetchMock = makeFetchMock()
    renderPage(baseUser, fetchMock)
    await screen.findByText('Ada Advisor')

    await userEvent.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => (url as string).includes('page=2'))
      expect(call).toBeDefined()
    })
  })
})

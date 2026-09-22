import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { CurrentUser } from '@/api/types'
import { AuthContext, type AuthContextValue } from '@/auth/AuthContext'
import { tokenStorage } from '@/api/tokenStorage'
import { ToastProvider } from '@/components/Toast/ToastProvider'
import { CustomerCreatePage } from './CustomerCreatePage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const currentUser: CurrentUser = {
  id: 'u1',
  email: 'me@example.edu',
  displayName: 'Me',
  preferredLocale: 'en',
  roles: ['SERVICE_ADVISOR'],
  permissions: ['customers.write'],
  organizationScopeIds: ['scope-own-1'],
  mustChangePassword: false,
}

function authValue(): AuthContextValue {
  return {
    status: 'authenticated',
    user: currentUser,
    error: null,
    login: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
    clearError: vi.fn(),
    refreshUser: vi.fn(),
  }
}

function renderPage(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/customers/new']}>
        <AuthContext value={authValue()}>
          <ToastProvider>
            <CustomerCreatePage />
          </ToastProvider>
        </AuthContext>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CustomerCreatePage', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('rejects a phone number that is not E.164', async () => {
    renderPage(vi.fn())

    await userEvent.type(screen.getByLabelText(/^Name/i), 'Jane Doe')
    await userEvent.type(screen.getByLabelText(/^Phone/i), '0501234567')
    await userEvent.click(screen.getByRole('button', { name: /Create customer/i }))

    expect(await screen.findByText(/international format/i)).toBeInTheDocument()
  })

  it("submits the exact CustomerCreateRequest shape, falling back to the caller's own scope", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        id: 'c1',
        organizationScopeId: 'scope-own-1',
        displayName: 'Jane Doe',
        type: 'INDIVIDUAL',
        phone: '+15551234567',
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        createdBy: 'u1',
        updatedBy: 'u1',
      }),
    )
    renderPage(fetchMock)

    await userEvent.type(screen.getByLabelText(/^Name/i), 'Jane Doe')
    await userEvent.type(screen.getByLabelText(/^Phone/i), '+15551234567')

    // No customers.read/users.read permission: scope select falls back to the
    // caller's own organizationScopeIds from /auth/me.
    const scopeSelect: HTMLSelectElement = screen.getByLabelText(/Organization scope/i)
    await userEvent.selectOptions(scopeSelect, 'scope-own-1')

    await userEvent.click(screen.getByRole('button', { name: /Create customer/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({
      displayName: 'Jane Doe',
      type: 'INDIVIDUAL',
      phone: '+15551234567',
      organizationScopeId: 'scope-own-1',
    })
  })
})

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { tokenStorage } from '@/api/tokenStorage'
import { ToastProvider } from '@/components/Toast/ToastProvider'
import { UserCreatePage } from './UserCreatePage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderPage(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/access/users/new']}>
        <ToastProvider>
          <UserCreatePage />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('UserCreatePage', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('renders the temporary password field as a masked password input', () => {
    renderPage(vi.fn())
    const passwordInput: HTMLInputElement = screen.getByLabelText(/Temporary password/i, { exact: false })
    expect(passwordInput.type).toBe('password')
  })

  it('never re-displays the temporary password and clears it after a successful create', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        id: 'new-user-1',
        email: 'new@example.edu',
        displayName: 'New Person',
        preferredLocale: 'en',
        status: 'ACTIVE',
        roles: [],
        organizationScopeIds: [],
        mustChangePassword: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        createdBy: 'sys',
        updatedBy: 'sys',
      }),
    )
    renderPage(fetchMock)

    await userEvent.type(screen.getByLabelText(/Email address/i), 'new@example.edu')
    await userEvent.type(screen.getByLabelText(/Display name/i), 'New Person')
    const passwordInput: HTMLInputElement = screen.getByLabelText(/Temporary password/i, { exact: false })
    await userEvent.type(passwordInput, 'Sw0rdfish!')

    await userEvent.click(screen.getByRole('button', { name: /Create user/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { temporaryPassword: string }
    expect(body.temporaryPassword).toBe('Sw0rdfish!')

    // Never sent as a query param / in the URL.
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).not.toContain('Sw0rdfish')

    await waitFor(() => expect(passwordInput.value).toBe(''))
  })
})

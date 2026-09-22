import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { CurrentUser } from '@/api/types'
import { tokenStorage } from '@/api/tokenStorage'
import { AuthContext, type AuthContextValue } from '@/auth/AuthContext'
import { ReportsPage } from './ReportsPage'

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
const user: CurrentUser = {
  id: 'u1',
  email: 'u@example.com',
  displayName: 'Manager',
  preferredLocale: 'en',
  roles: ['WORKSHOP_MANAGER'],
  permissions: ['dashboards.workshop'],
  organizationScopeIds: [],
  mustChangePassword: false,
}
function renderPage(currentUser = user) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const value: AuthContextValue = {
    status: 'authenticated',
    user: currentUser,
    error: null,
    login: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
    clearError: vi.fn(),
    refreshUser: vi.fn(),
  }
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AuthContext value={value}>
          <ReportsPage />
        </AuthContext>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
describe('ReportsPage', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })
  it('renders dashboard decimal metrics as strings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(200, {
          dashboard: 'WORKSHOP',
          generatedAt: '2026-09-01T00:00:00Z',
          dataAsOf: '2026-09-01T00:00:00Z',
          filterFingerprint: 'fp',
          appliedFilters: {},
          metrics: [
            {
              key: 'TOTAL_AMOUNT',
              label: 'Total',
              unit: 'MONEY',
              value: '1234567890.1200',
              currencyCode: 'USD',
              recordCount: 4,
            },
          ],
        }),
      ),
    )
    renderPage()
    expect(await screen.findByText('1,234,567,890.1200 USD')).toBeInTheDocument()
  })
  it('shows an honest unavailable state for a missing endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(404, { code: 'NOT_FOUND', message: 'missing' })))
    renderPage()
    expect(await screen.findByText('Not yet available')).toBeInTheDocument()
    expect(screen.getByText(/No placeholder data/)).toBeInTheDocument()
  })
})

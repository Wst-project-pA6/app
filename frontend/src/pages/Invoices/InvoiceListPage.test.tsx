import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { CurrentUser } from '@/api/types'
import { tokenStorage } from '@/api/tokenStorage'
import { AuthContext, type AuthContextValue } from '@/auth/AuthContext'
import { InvoiceListPage } from './InvoiceListPage'

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
const user: CurrentUser = {
  id: 'u1',
  email: 'u@example.com',
  displayName: 'Finance',
  preferredLocale: 'en',
  roles: ['FINANCE_VIEWER_AUDITOR'],
  permissions: ['invoices.read'],
  organizationScopeIds: [],
  mustChangePassword: false,
}
describe('InvoiceListPage', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })
  it('renders server-provided invoice list rows and sends the default filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(200, {
        items: [
          {
            id: 'inv1',
            createdAt: '2026-09-01T00:00:00Z',
            updatedAt: '2026-09-01T00:00:00Z',
            createdBy: 'u1',
            updatedBy: 'u1',
            jobId: 'job1',
            jobNumber: 'JC-1',
            customerId: 'c1',
            status: 'PAID',
            currencyCode: 'USD',
            lines: [],
            totals: {
              laborSubtotal: { amount: '0.00', currency: 'USD' },
              partsSubtotal: { amount: '0.00', currency: 'USD' },
              subletSubtotal: { amount: '0.00', currency: 'USD' },
              subtotal: { amount: '0.00', currency: 'USD' },
              discountTotal: { amount: '0.00', currency: 'USD' },
              taxableAmount: { amount: '0.00', currency: 'USD' },
              taxRatePercent: '0.00',
              taxAmount: { amount: '0.00', currency: 'USD' },
              total: { amount: '42.1000', currency: 'USD' },
            },
            payments: [],
            version: 1,
          },
        ],
        page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
      }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const value: AuthContextValue = {
      status: 'authenticated',
      user,
      error: null,
      login: vi.fn(),
      changePassword: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
      refreshUser: vi.fn(),
    }
    vi.stubGlobal('fetch', fetchMock)
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <AuthContext value={value}>
            <InvoiceListPage />
          </AuthContext>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('JC-1')).toBeInTheDocument()
    expect(screen.getByText('42.1000 USD')).toBeInTheDocument()
    expect(fetchMock.mock.calls[0][0]).toContain('sort=-createdAt')
  })
})

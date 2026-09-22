import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { CurrentUser } from '@/api/types'
import { tokenStorage } from '@/api/tokenStorage'
import { AuthContext, type AuthContextValue } from '@/auth/AuthContext'
import { InvoiceDetailPage } from './InvoiceDetailPage'
import { ToastProvider } from '@/components/Toast/ToastProvider'

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
const invoice = {
  id: 'inv1',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  createdBy: 'u1',
  updatedBy: 'u1',
  jobId: 'job1',
  jobNumber: 'JC-1',
  customerId: 'c1',
  status: 'ISSUED' as const,
  currencyCode: 'USD',
  version: 1,
  lines: [
    {
      id: 'line1',
      lineType: 'LABOR' as const,
      description: 'Brake labor',
      quantity: '1.0000',
      unitPrice: { amount: '1234.5000', currency: 'USD' },
      lineTotal: { amount: '1234.5000', currency: 'USD' },
      sourceType: 'LABOR_ENTRY' as const,
      sourceId: 'labor1',
    },
  ],
  totals: {
    laborSubtotal: { amount: '1234.5000', currency: 'USD' },
    partsSubtotal: { amount: '0.0000', currency: 'USD' },
    subletSubtotal: { amount: '0.0000', currency: 'USD' },
    subtotal: { amount: '1234.5000', currency: 'USD' },
    discountTotal: { amount: '0.0000', currency: 'USD' },
    taxableAmount: { amount: '1234.5000', currency: 'USD' },
    taxRatePercent: '15.0000',
    taxAmount: { amount: '185.1750', currency: 'USD' },
    total: { amount: '1419.6750', currency: 'USD' },
  },
  payments: [],
}
const user: CurrentUser = {
  id: 'u1',
  email: 'u@example.com',
  displayName: 'Finance',
  preferredLocale: 'en',
  roles: ['SERVICE_ADVISOR'],
  permissions: ['invoices.read'],
  organizationScopeIds: [],
  mustChangePassword: false,
}
function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: 'authenticated',
    user,
    error: null,
    login: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
    clearError: vi.fn(),
    refreshUser: vi.fn(),
    ...overrides,
  }
}
function renderPage(currentUser = user) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/invoices/inv1']}>
        <AuthContext value={auth({ user: currentUser })}>
          <ToastProvider>
            <Routes>
              <Route path="/invoices/:invoiceId" element={<InvoiceDetailPage />} />
            </Routes>
          </ToastProvider>
        </AuthContext>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('InvoiceDetailPage', () => {
  beforeEach(() => {
    tokenStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('renders backend decimal strings without numeric rounding', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, invoice)))
    renderPage()
    expect(await screen.findByText('1,419.6750 USD')).toBeInTheDocument()
    expect(screen.getByText('1.0000')).toBeInTheDocument()
    expect(screen.getAllByText('1,234.5000 USD').length).toBeGreaterThan(0)
  })

  it('gates issue, void, and payment controls by their exact permissions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, invoice)))
    renderPage()
    await screen.findByText('1,419.6750 USD')
    expect(screen.queryByText('Void invoice')).not.toBeInTheDocument()
    expect(screen.queryByText('Record payment')).not.toBeInTheDocument()
  })

  it('records an exact payment and sends a void transition with the reason', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/invoices/inv1') && (!init || init.method === 'GET'))
        return Promise.resolve(response(200, invoice))
      if (url.endsWith('/payments')) return Promise.resolve(response(201, { id: 'pay1' }))
      if (url.endsWith('/transitions'))
        return Promise.resolve(response(200, { ...invoice, status: 'VOID', voidReason: 'Customer dispute' }))
      return Promise.resolve(response(200, invoice))
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('prompt', vi.fn().mockReturnValue('Customer dispute'))
    renderPage({ ...user, permissions: ['invoices.read', 'invoices.manage', 'payments.record'] })
    await screen.findByText('1,419.6750 USD')
    await userEvent.click(screen.getByText('Record payment'))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => (url as string).endsWith('/payments'))).toBe(true))
    await userEvent.click(screen.getByText('Void invoice'))
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => (url as string).endsWith('/transitions'))
      expect(call).toBeDefined()
      expect(JSON.parse((call?.[1] as RequestInit).body as string)).toEqual({
        toStatus: 'VOID',
        reason: 'Customer dispute',
      })
    })
  })
})

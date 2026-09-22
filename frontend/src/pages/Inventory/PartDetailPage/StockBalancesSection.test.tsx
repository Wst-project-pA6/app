import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { CurrentUser } from '@/api/types'
import { AuthContext, type AuthContextValue } from '@/auth/AuthContext'
import { tokenStorage } from '@/api/tokenStorage'
import { ToastProvider } from '@/components/Toast/ToastProvider'
import { StockBalancesSection } from './StockBalancesSection'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const balancePage = {
  items: [
    {
      storeId: 's1',
      partId: 'p1',
      sku: 'BRK-001',
      onHand: 10,
      reserved: 2,
      available: 8,
      minLevel: 5,
      maxLevel: 50,
      averageCost: { amount: '12.5000', currency: 'USD' },
      belowMinimum: false,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  page: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
}

const baseUser: CurrentUser = {
  id: 'u1',
  email: 'storekeeper@example.edu',
  displayName: 'Storekeeper',
  preferredLocale: 'en',
  roles: ['STOREKEEPER_PROCUREMENT'],
  permissions: ['parts.read'],
  organizationScopeIds: [],
  mustChangePassword: false,
}

function authValue(user: CurrentUser): AuthContextValue {
  return {
    status: 'authenticated',
    user,
    error: null,
    login: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
    clearError: vi.fn(),
    refreshUser: vi.fn(),
  }
}

function renderSection(user: CurrentUser) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, balancePage)))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext value={authValue(user)}>
        <ToastProvider>
          <StockBalancesSection partId="p1" />
        </ToastProvider>
      </AuthContext>
    </QueryClientProvider>,
  )
}

describe('StockBalancesSection cost visibility', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('completely omits the average cost column without inventory.cost.read', async () => {
    renderSection(baseUser)
    await screen.findByText('8') // available column, confirms data loaded

    expect(screen.queryByText('Average cost')).not.toBeInTheDocument()
    expect(screen.queryByText(/12,\.?5000/)).not.toBeInTheDocument()
    expect(screen.queryByText(/12,500|12\.5000/)).not.toBeInTheDocument()
  })

  it('shows the average cost column and value when the caller holds inventory.cost.read', async () => {
    renderSection({ ...baseUser, permissions: ['parts.read', 'inventory.cost.read'] })
    await screen.findByText('Average cost')
    expect(screen.getByText('12.5000 USD')).toBeInTheDocument()
  })
})

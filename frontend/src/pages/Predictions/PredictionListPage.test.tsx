import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { CurrentUser } from '@/api/types'
import { tokenStorage } from '@/api/tokenStorage'
import { AuthContext, type AuthContextValue } from '@/auth/AuthContext'
import { ToastProvider } from '@/components/Toast/ToastProvider'
import { PredictionListPage } from './PredictionListPage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const reorderPrediction = {
  id: 'pred-1',
  type: 'REORDER_SUGGESTION',
  status: 'ACTIVE',
  advisoryOnly: true,
  generatedAt: '2026-09-20T09:00:00Z',
  source: { kind: 'RULE_BASELINE', name: 'reorder-rules', version: '1' },
  explanation: { summary: 'Reorder brake pads', factors: [] },
  reorder: {
    input: {
      storeId: 'store-1',
      partId: 'part-1',
      partSku: 'BRK-001',
      onHand: 2,
      reserved: 0,
      available: 2,
      minLevel: 5,
      maxLevel: 20,
      openPurchaseOrderQuantity: 0,
      averageWeeklyConsumption: '3.0000',
      lookbackWeeks: 4,
    },
    result: { suggestedQuantity: 18, estimatedWeeksOfCover: '0.6667' },
  },
}
const predictionPage = { items: [reorderPrediction], page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }

const baseUser: CurrentUser = {
  id: 'u1',
  email: 'storekeeper@example.edu',
  displayName: 'Storekeeper',
  preferredLocale: 'en',
  roles: ['STOREKEEPER_PROCUREMENT'],
  permissions: ['predictions.reorder.read'],
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

function renderPage(user: CurrentUser) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/predictions']}>
        <AuthContext value={authValue(user)}>
          <ToastProvider>
            <PredictionListPage />
          </ToastProvider>
        </AuthContext>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PredictionListPage', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('labels every result as advisory and shows the source/version, never as an automatic decision', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, predictionPage)))
    renderPage(baseUser)

    expect(await screen.findByText('Advisory only — not an automatic decision')).toBeInTheDocument()
    expect(await screen.findByText('Reorder brake pads')).toBeInTheDocument()
    expect(screen.getByText(/RULE_BASELINE · reorder-rules · v1/)).toBeInTheDocument()
  })

  it('shows an honest unavailable state instead of fake data when the endpoint is disabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(404, { code: 'NOT_FOUND', message: 'missing' })))
    renderPage(baseUser)

    expect(await screen.findByText('Not yet available')).toBeInTheDocument()
    expect(screen.getByText(/No placeholder data/)).toBeInTheDocument()
    expect(screen.queryByText('Reorder brake pads')).not.toBeInTheDocument()
  })

  it('hides the decide action without predictions.reorder.decide, and the run-now panel entirely', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, predictionPage)))
    renderPage(baseUser)

    await screen.findByText('Reorder brake pads')
    expect(screen.queryByRole('button', { name: 'Decide' })).not.toBeInTheDocument()
    expect(screen.queryByText('Run the rule baseline now')).not.toBeInTheDocument()
  })

  it('lets a permitted user record a decision, which calls the decisions endpoint and never a purchasing endpoint', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/decisions')) {
        return Promise.resolve(jsonResponse(200, { ...reorderPrediction, status: 'ACCEPTED' }))
      }
      return Promise.resolve(jsonResponse(200, predictionPage))
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    renderPage({ ...baseUser, permissions: ['predictions.reorder.read', 'predictions.reorder.decide'] })

    await screen.findByText('Reorder brake pads')
    await user.click(screen.getByRole('button', { name: 'Decide' }))
    await user.click(screen.getByRole('button', { name: 'Record decision' }))

    await waitFor(() => expect(screen.getByText('Decision recorded.')).toBeInTheDocument())
    const calledUrls = fetchMock.mock.calls.map((call) => call[0])
    expect(calledUrls.some((url) => url.includes('/predictions/pred-1/decisions'))).toBe(true)
    expect(calledUrls.some((url) => url.includes('/purchase'))).toBe(false)
  })
})

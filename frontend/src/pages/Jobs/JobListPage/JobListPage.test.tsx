import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { CurrentUser } from '@/api/types'
import { AuthContext, type AuthContextValue } from '@/auth/AuthContext'
import { tokenStorage } from '@/api/tokenStorage'
import { JobListPage } from './JobListPage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const jobPage = {
  items: [
    {
      id: 'j1',
      jobNumber: 'JC-2026-000001',
      customerId: 'c1',
      vehicleId: 'v1',
      vehiclePlate: 'ABC123',
      customerDisplayName: 'Ada Advisor',
      organizationScopeId: 's1',
      complaint: 'Noise from front brakes',
      serviceType: 'REPAIR',
      priority: 'HIGH',
      mileageAtIntake: 50000,
      stage: 'RECEIVED',
      expectedCompletionAt: '2026-02-01T12:00:00.000Z',
      approvalSummary: { billableWorkAllowed: false, approvedScopes: [], pendingApprovalCount: 0 },
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'u1',
      updatedBy: 'u1',
    },
  ],
  page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
}

const baseUser: CurrentUser = {
  id: 'u1',
  email: 'advisor@example.edu',
  displayName: 'Advisor',
  preferredLocale: 'en',
  roles: ['SERVICE_ADVISOR'],
  permissions: ['jobs.read'],
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
      <MemoryRouter initialEntries={['/jobs']}>
        <AuthContext value={authValue({ user })}>
          <JobListPage />
        </AuthContext>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('JobListPage', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('requests the default-sorted first page and applies the stage filter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, jobPage))
    renderPage(baseUser, fetchMock)

    expect(await screen.findByText('JC-2026-000001')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Stage'), 'IN_PROGRESS')

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => (url as string).includes('stage=IN_PROGRESS'))
      expect(call).toBeDefined()
    })
  })

  it('hides the create action for a user without jobs.create', async () => {
    renderPage(baseUser, vi.fn().mockResolvedValue(jsonResponse(200, jobPage)))
    await screen.findByText('JC-2026-000001')
    expect(screen.queryByText('New job card')).not.toBeInTheDocument()
  })

  it('shows the create action for a user with jobs.create', async () => {
    renderPage(
      { ...baseUser, permissions: ['jobs.read', 'jobs.create'] },
      vi.fn().mockResolvedValue(jsonResponse(200, jobPage)),
    )
    await screen.findByText('JC-2026-000001')
    expect(screen.getByText('New job card')).toBeInTheDocument()
  })
})

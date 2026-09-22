import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
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
  preferredLocale: 'ar',
  roles: ['SERVICE_ADVISOR'],
  permissions: ['jobs.read'],
  organizationScopeIds: [],
  mustChangePassword: false,
}

describe('JobListPage under RTL layout', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    document.documentElement.removeAttribute('dir')
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('keeps the job number and plate columns directionally stable when the document is RTL', async () => {
    document.documentElement.dir = 'rtl'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, jobPage)))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const authValue: AuthContextValue = {
      status: 'authenticated',
      user: baseUser,
      error: null,
      login: vi.fn(),
      changePassword: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
      refreshUser: vi.fn(),
    }

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/jobs']}>
          <AuthContext value={authValue}>
            <JobListPage />
          </AuthContext>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    const jobNumberCell = (await screen.findByText('JC-2026-000001')).closest('td')
    const plateCell = screen.getByText('ABC123').closest('td')

    expect(jobNumberCell?.className).toContain('dir-ltr')
    expect(plateCell?.className).toContain('dir-ltr')
  })
})

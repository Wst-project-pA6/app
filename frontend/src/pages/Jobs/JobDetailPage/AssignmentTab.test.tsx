import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { tokenStorage } from '@/api/tokenStorage'
import { ToastProvider } from '@/components/Toast/ToastProvider'
import type { JobCard } from '@/api/types'
import { AssignmentTab } from './AssignmentTab'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const job: JobCard = {
  id: 'j1',
  jobNumber: 'JC-2026-000001',
  customerId: 'c1',
  vehicleId: 'v1',
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
}

function renderTab(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AssignmentTab job={job} />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('AssignmentTab critical error rendering', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('renders a clear conflict message with the backend requestId for a 409 SCHEDULE_CONFLICT', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/bays'))
        return Promise.resolve(
          jsonResponse(200, {
            items: [
              {
                id: 'b1',
                code: 'B1',
                name: 'Bay 1',
                capacity: 1,
                status: 'ACTIVE',
                organizationScopeId: 's1',
                createdAt: '',
                updatedAt: '',
                createdBy: '',
                updatedBy: '',
              },
            ],
            page: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
          }),
        )
      if (url.includes('/technicians'))
        return Promise.resolve(
          jsonResponse(200, {
            items: [{ id: 't1', displayName: 'Tina Tech' }],
            page: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
          }),
        )
      if (url.includes('/assignment')) {
        return Promise.resolve(
          jsonResponse(409, {
            code: 'SCHEDULE_CONFLICT',
            message: 'Bay is already booked for this window',
            requestId: 'req-conflict-1',
            conflicts: [],
          }),
        )
      }
      return Promise.reject(new Error(`Unexpected URL ${url}`))
    })
    renderTab(fetchMock)

    await screen.findByRole('option', { name: /Bay 1/i })
    await userEvent.selectOptions(screen.getByLabelText(/Bay/i), 'b1')
    await screen.findByRole('option', { name: /Tina Tech/i })
    await userEvent.selectOptions(screen.getByLabelText(/Technician/i), 't1')
    fireEvent.change(screen.getByLabelText(/Scheduled start/i), { target: { value: '2026-01-02T08:00' } })
    fireEvent.change(screen.getByLabelText(/Expected completion/i), { target: { value: '2026-01-02T12:00' } })
    await userEvent.click(screen.getByRole('button', { name: /Save assignment/i }))

    expect(await screen.findByText('Scheduling conflict')).toBeInTheDocument()
    expect(screen.getByText('Bay is already booked for this window')).toBeInTheDocument()
  })
})

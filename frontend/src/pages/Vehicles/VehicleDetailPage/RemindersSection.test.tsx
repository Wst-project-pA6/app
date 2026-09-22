import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { tokenStorage } from '@/api/tokenStorage'
import { ToastProvider } from '@/components/Toast/ToastProvider'
import { RemindersSection } from './RemindersSection'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const reminderPage = {
  items: [
    {
      id: 'r-open',
      vehicleId: 'v1',
      title: 'Open reminder',
      dueMileage: 20000,
      status: 'OPEN',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'u1',
      updatedBy: 'u1',
    },
    {
      id: 'r-done',
      vehicleId: 'v1',
      title: 'Done reminder',
      dueMileage: 10000,
      status: 'DONE',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'u1',
      updatedBy: 'u1',
    },
  ],
  page: { page: 1, pageSize: 10, totalItems: 2, totalPages: 1 },
}

function renderSection(canWrite: boolean) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, reminderPage)))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>
          <RemindersSection vehicleId="v1" canWrite={canWrite} />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RemindersSection', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('shows edit/complete/cancel actions only for OPEN reminders, never for terminal ones', async () => {
    renderSection(true)

    const openRow = (await screen.findByText('Open reminder')).closest('tr')!
    const doneRow = screen.getByText('Done reminder').closest('tr')!

    expect(within(openRow).getByText('Mark done')).toBeInTheDocument()
    expect(within(openRow).getByText('Cancel reminder')).toBeInTheDocument()
    expect(within(doneRow).queryByText('Mark done')).not.toBeInTheDocument()
    expect(within(doneRow).queryByText('Cancel reminder')).not.toBeInTheDocument()
  })

  it('hides all reminder actions when the caller lacks vehicles.write', async () => {
    renderSection(false)
    await screen.findByText('Open reminder')
    expect(screen.queryByText('Mark done')).not.toBeInTheDocument()
    expect(screen.queryByText('New reminder')).not.toBeInTheDocument()
  })
})

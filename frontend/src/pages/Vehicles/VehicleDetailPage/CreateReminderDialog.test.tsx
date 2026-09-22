import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { tokenStorage } from '@/api/tokenStorage'
import { ToastProvider } from '@/components/Toast/ToastProvider'
import { CreateReminderDialog } from './CreateReminderDialog'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderDialog(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <CreateReminderDialog open onClose={() => {}} vehicleId="v1" />
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('CreateReminderDialog', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('requires at least one of due date or due mileage', async () => {
    const fetchMock = vi.fn()
    renderDialog(fetchMock)

    await userEvent.type(screen.getByLabelText(/^Title/i), 'Oil change')
    await userEvent.click(screen.getByRole('button', { name: /Create reminder/i }))

    expect(await screen.findByText(/at least a due date or a due mileage/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('submits with only a due mileage provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        id: 'r1',
        vehicleId: 'v1',
        title: 'Oil change',
        dueMileage: 20000,
        status: 'OPEN',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        createdBy: 'u1',
        updatedBy: 'u1',
      }),
    )
    renderDialog(fetchMock)

    await userEvent.type(screen.getByLabelText(/^Title/i), 'Oil change')
    await userEvent.type(screen.getByLabelText(/Due mileage/i), '20000')
    await userEvent.click(screen.getByRole('button', { name: /Create reminder/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ title: 'Oil change', dueMileage: 20000 })
  })
})

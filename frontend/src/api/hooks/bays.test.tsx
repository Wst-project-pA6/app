import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCreateBayMutation } from './bays'
import { tokenStorage } from '../tokenStorage'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const createdBay = {
  id: 'b1',
  code: 'B1',
  name: 'Bay 1',
  capacity: 2,
  status: 'ACTIVE',
  organizationScopeId: 's1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'u1',
  updatedBy: 'u1',
}

describe('useCreateBayMutation', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('invalidates the bays list query after a successful create', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(201, createdBay)))

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useCreateBayMutation(), { wrapper })

    await result.current.mutateAsync({ organizationScopeId: 's1', code: 'B1', name: 'Bay 1', capacity: 2 })

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled())
  })
})

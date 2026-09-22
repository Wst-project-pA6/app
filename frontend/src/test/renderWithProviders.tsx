import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthProvider'
import { ToastProvider } from '@/components/Toast/ToastProvider'
import { ThemeProvider } from '@/theme/ThemeProvider'
import '@/i18n'

export function renderWithProviders(ui: ReactElement, { initialEntries = ['/'] }: { initialEntries?: string[] } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>
          <AuthProvider>
            <ToastProvider>{ui}</ToastProvider>
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

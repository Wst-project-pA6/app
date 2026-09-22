import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './app/AppRoutes'
import { queryClient } from './app/queryClient'
import { ErrorBoundary } from './app/ErrorBoundary'
import { AuthProvider } from './auth/AuthProvider'
import { ToastProvider } from './components/Toast/ToastProvider'
import { ThemeProvider } from './theme/ThemeProvider'

export function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <ToastProvider>
                <AppRoutes />
              </ToastProvider>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

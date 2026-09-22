import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '@/i18n'
import type { CurrentUser } from '@/api/types'
import { AuthContext, type AuthContextValue } from './AuthContext'
import { PermissionGate } from './PermissionRoute'
import { ProtectedRoute } from './ProtectedRoute'

const baseUser: CurrentUser = {
  id: 'u1',
  email: 'advisor@example.edu',
  displayName: 'Ada Advisor',
  preferredLocale: 'en',
  roles: ['SERVICE_ADVISOR'],
  permissions: ['customers.read'],
  organizationScopeIds: [],
  mustChangePassword: false,
}

function withAuthValue(value: Partial<AuthContextValue>) {
  const fullValue: AuthContextValue = {
    status: 'unauthenticated',
    user: null,
    error: null,
    login: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
    clearError: vi.fn(),
    refreshUser: vi.fn(),
    ...value,
  }
  return fullValue
}

function renderApp(initialPath: string, authValue: AuthContextValue) {
  return render(
    <AuthContext value={authValue}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<p>LOGIN PAGE</p>} />
          <Route path="/change-password" element={<p>CHANGE PASSWORD PAGE</p>} />
          <Route path="/forbidden" element={<p>FORBIDDEN PAGE</p>} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <p>HOME PAGE</p>
              </ProtectedRoute>
            }
          />
          <Route
            path="/customers"
            element={
              <ProtectedRoute>
                <PermissionGate anyOf={['customers.read']}>
                  <p>CUSTOMERS PAGE</p>
                </PermissionGate>
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <ProtectedRoute>
                <PermissionGate anyOf={['audit.read']}>
                  <p>AUDIT PAGE</p>
                </PermissionGate>
              </ProtectedRoute>
            }
          />
          <Route
            path="/pending-access"
            element={
              <ProtectedRoute>
                <p>PENDING ACCESS PAGE</p>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </AuthContext>,
  )
}

describe('ProtectedRoute', () => {
  it('redirects an unauthenticated visitor to /login', () => {
    renderApp('/', withAuthValue({ status: 'unauthenticated', user: null }))
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument()
  })

  it('shows a loading state while the session is being restored', () => {
    renderApp('/', withAuthValue({ status: 'restoring', user: null }))
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders the protected content for an authenticated user', () => {
    renderApp('/', withAuthValue({ status: 'authenticated', user: baseUser }))
    expect(screen.getByText('HOME PAGE')).toBeInTheDocument()
  })

  it('redirects to /change-password when mustChangePassword is set', () => {
    renderApp('/', withAuthValue({ status: 'authenticated', user: { ...baseUser, mustChangePassword: true } }))
    expect(screen.getByText('CHANGE PASSWORD PAGE')).toBeInTheDocument()
  })
})

describe('PermissionGate (ANY-OF)', () => {
  it('renders the page when the user holds a required permission', () => {
    renderApp('/customers', withAuthValue({ status: 'authenticated', user: baseUser }))
    expect(screen.getByText('CUSTOMERS PAGE')).toBeInTheDocument()
  })

  it('redirects to /forbidden when the user holds none of the required permissions', () => {
    renderApp('/audit', withAuthValue({ status: 'authenticated', user: baseUser }))
    expect(screen.getByText('FORBIDDEN PAGE')).toBeInTheDocument()
  })
})

describe('pending access', () => {
  const pendingUser: CurrentUser = { ...baseUser, roles: [], permissions: [] }

  it('redirects an authenticated user with no roles or permissions to /pending-access', () => {
    renderApp('/', withAuthValue({ status: 'authenticated', user: pendingUser }))
    expect(screen.getByText('PENDING ACCESS PAGE')).toBeInTheDocument()
  })

  it('does not redirect a user who already holds a role and permissions', () => {
    renderApp('/', withAuthValue({ status: 'authenticated', user: baseUser }))
    expect(screen.getByText('HOME PAGE')).toBeInTheDocument()
  })

  it('does not loop when already on /pending-access', () => {
    renderApp('/pending-access', withAuthValue({ status: 'authenticated', user: pendingUser }))
    expect(screen.getByText('PENDING ACCESS PAGE')).toBeInTheDocument()
  })
})

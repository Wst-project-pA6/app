import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import '@/i18n'
import type { CurrentUser } from '@/api/types'
import { AuthContext, type AuthContextValue } from '@/auth/AuthContext'
import { Sidebar } from './Sidebar'

function renderSidebar(user: CurrentUser) {
  const value: AuthContextValue = {
    status: 'authenticated',
    user,
    error: null,
    login: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
    clearError: vi.fn(),
    refreshUser: vi.fn(),
  }

  return render(
    <AuthContext value={value}>
      <MemoryRouter>
        <Sidebar collapsed={false} mobileOpen={false} onNavigate={() => {}} />
      </MemoryRouter>
    </AuthContext>,
  )
}

const baseUser: CurrentUser = {
  id: 'u1',
  email: 'tech@example.edu',
  displayName: 'Tina Technician',
  preferredLocale: 'en',
  roles: ['TECHNICIAN'],
  permissions: [],
  organizationScopeIds: [],
  mustChangePassword: false,
}

describe('Sidebar navigation visibility', () => {
  it('always shows the dashboard link, which requires authentication only', () => {
    renderSidebar(baseUser)
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument()
  })

  it('hides a module link when the user has none of its required permissions', () => {
    renderSidebar(baseUser)
    expect(screen.queryByRole('link', { name: /customers/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /audit events/i })).not.toBeInTheDocument()
  })

  it('shows a module link once the user holds any one of its required permissions', () => {
    renderSidebar({ ...baseUser, permissions: ['customers.read'] })
    expect(screen.getByRole('link', { name: /customers/i })).toBeInTheDocument()
  })

  it('shows more links for a user with broader permissions', () => {
    renderSidebar({
      ...baseUser,
      permissions: ['customers.read', 'vehicles.read', 'inventory.read', 'audit.read'],
    })
    expect(screen.getByRole('link', { name: /customers/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /vehicles/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /inventory/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /audit events/i })).toBeInTheDocument()
  })
})

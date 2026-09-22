import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import '@/i18n'
import { ApiError } from '@/api/errors'
import { AuthContext, type AuthContextValue } from '@/auth/AuthContext'
import { LoginPage } from './LoginPage'

function renderLoginPage(login: AuthContextValue['login']) {
  const value: AuthContextValue = {
    status: 'unauthenticated',
    user: null,
    error: null,
    login,
    changePassword: vi.fn(),
    logout: vi.fn(),
    clearError: vi.fn(),
    refreshUser: vi.fn(),
  }

  return render(
    <AuthContext value={value}>
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>
    </AuthContext>,
  )
}

describe('LoginPage', () => {
  it('submits the entered credentials and logs in successfully', async () => {
    const user = userEvent.setup()
    const login = vi.fn().mockResolvedValue({ mustChangePassword: false })
    renderLoginPage(login)

    await user.type(screen.getByLabelText(/email address/i), 'advisor@example.edu')
    await user.type(screen.getByLabelText(/password/i, { selector: 'input' }), 'correct-password')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(login).toHaveBeenCalledWith('advisor@example.edu', 'correct-password'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a friendly error, without leaking internals, when credentials are rejected', async () => {
    const user = userEvent.setup()
    const login = vi
      .fn()
      .mockRejectedValue(
        new ApiError({ message: 'invalid', code: 'INVALID_CREDENTIALS', status: 401, requestId: 'req-42' }),
      )
    renderLoginPage(login)

    await user.type(screen.getByLabelText(/email address/i), 'advisor@example.edu')
    await user.type(screen.getByLabelText(/password/i, { selector: 'input' }), 'wrong-password')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/incorrect/i)
  })

  it('associates validation errors with their inputs for assistive technology', async () => {
    const user = userEvent.setup()
    renderLoginPage(vi.fn())

    await user.click(screen.getByRole('button', { name: /sign in/i }))

    const emailInput = await screen.findByLabelText(/email address/i)
    expect(emailInput).toHaveAttribute('aria-invalid', 'true')
    const describedBy = emailInput.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    expect(document.getElementById(describedBy!)).toHaveTextContent(/valid email/i)
  })
})

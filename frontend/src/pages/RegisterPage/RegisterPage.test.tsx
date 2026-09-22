import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { AuthProvider } from '@/auth/AuthProvider'
import { tokenStorage } from '@/api/tokenStorage'
import { RegisterPage } from './RegisterPage'

function jsonResponse(status: number, body: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderPage(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<p>LOGIN PAGE</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('RegisterPage', () => {
  beforeEach(() => tokenStorage.clear())
  afterEach(() => {
    vi.unstubAllGlobals()
    tokenStorage.clear()
  })

  it('rejects mismatched passwords before submitting', async () => {
    const fetchMock = vi.fn()
    renderPage(fetchMock)

    await userEvent.type(screen.getByLabelText(/Full name/i), 'Sam Student')
    await userEvent.type(screen.getByLabelText(/Email address/i), 'sam@example.edu')
    await userEvent.type(screen.getByLabelText(/^Password/i), 'correcthorsebattery')
    await userEvent.type(screen.getByLabelText(/Confirm password/i), 'differentpassword')
    await userEvent.click(screen.getByRole('button', { name: /Create account/i }))

    expect(await screen.findByText(/Passwords must match/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('registers, never auto-logs-in, and redirects to login with a success message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, undefined))
    renderPage(fetchMock)

    await userEvent.type(screen.getByLabelText(/Full name/i), 'Sam Student')
    await userEvent.type(screen.getByLabelText(/Email address/i), 'sam@example.edu')
    await userEvent.type(screen.getByLabelText(/^Password/i), 'correcthorsebattery')
    await userEvent.type(screen.getByLabelText(/Confirm password/i), 'correcthorsebattery')
    await userEvent.click(screen.getByRole('button', { name: /Create account/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/auth/register')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).toEqual({
      displayName: 'Sam Student',
      email: 'sam@example.edu',
      preferredLocale: 'en',
      password: 'correcthorsebattery',
    })

    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument()
    // Never auto-login: no access/refresh token stored after registration.
    expect(tokenStorage.getAccessToken()).toBeNull()
  })
})

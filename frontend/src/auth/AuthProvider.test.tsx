import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { tokenStorage } from '@/api/tokenStorage'
import { notifySessionExpired } from '@/api/sessionEvents'
import type { CurrentUser, TokenPair } from '@/api/types'
import { AuthProvider } from './AuthProvider'
import { useAuth } from './useAuth'

const refreshOnceMock = vi.hoisted(() => vi.fn<() => Promise<TokenPair>>())
vi.mock('@/api/client', () => ({
  refreshOnce: () => refreshOnceMock(),
}))

const authApiMock = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  changePassword: vi.fn(),
  getCurrentUser: vi.fn(),
}))
vi.mock('@/api/endpoints/auth', () => authApiMock)

const sampleUser: CurrentUser = {
  id: 'user-1',
  email: 'advisor@example.edu',
  displayName: 'Ada Advisor',
  preferredLocale: 'en',
  roles: ['SERVICE_ADVISOR'],
  permissions: ['customers.read', 'vehicles.read'],
  organizationScopeIds: [],
  mustChangePassword: false,
}

const tokenPair: TokenPair = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  tokenType: 'Bearer',
  expiresIn: 900,
  mustChangePassword: false,
}

function Probe() {
  const { status, user, login, logout } = useAuth()
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user">{user?.displayName ?? 'none'}</p>
      <button onClick={() => void login('advisor@example.edu', 'correct-password')}>login</button>
      <button onClick={() => void logout()}>logout</button>
    </div>
  )
}

describe('AuthProvider', () => {
  beforeEach(() => {
    tokenStorage.clear()
    refreshOnceMock.mockReset()
    authApiMock.login.mockReset()
    authApiMock.logout.mockReset()
    authApiMock.changePassword.mockReset()
    authApiMock.getCurrentUser.mockReset()
  })

  afterEach(() => {
    tokenStorage.clear()
  })

  it('starts unauthenticated when there is no stored refresh token', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
  })

  it('restores an authenticated session from a stored refresh token', async () => {
    tokenStorage.setRefreshToken('a-stored-refresh-token')
    // Mirrors refreshOnce's real side effect (see api/client.ts): it stores
    // the new token pair itself, so AuthProvider's restore() no longer has to.
    refreshOnceMock.mockImplementation(() => {
      tokenStorage.setAccessToken(tokenPair.accessToken)
      tokenStorage.setRefreshToken(tokenPair.refreshToken)
      return Promise.resolve(tokenPair)
    })
    authApiMock.getCurrentUser.mockResolvedValue(sampleUser)

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(screen.getByTestId('user')).toHaveTextContent('Ada Advisor')
    expect(tokenStorage.getAccessToken()).toBe('access-1')
  })

  it('clears the session when restoring the stored refresh token fails', async () => {
    tokenStorage.setRefreshToken('an-invalid-refresh-token')
    refreshOnceMock.mockRejectedValue(new Error('refresh rejected'))

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    expect(tokenStorage.getRefreshToken()).toBeNull()
  })

  it('logs in successfully and exposes the current user', async () => {
    authApiMock.login.mockResolvedValue(tokenPair)
    authApiMock.getCurrentUser.mockResolvedValue(sampleUser)

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))

    act(() => {
      screen.getByText('login').click()
    })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))
    expect(screen.getByTestId('user')).toHaveTextContent('Ada Advisor')
  })

  it('logs out and clears stored tokens', async () => {
    authApiMock.login.mockResolvedValue(tokenPair)
    authApiMock.getCurrentUser.mockResolvedValue(sampleUser)
    authApiMock.logout.mockResolvedValue(undefined)

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))

    act(() => {
      screen.getByText('login').click()
    })
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    act(() => {
      screen.getByText('logout').click()
    })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
    expect(tokenStorage.getAccessToken()).toBeNull()
    expect(tokenStorage.getRefreshToken()).toBeNull()
  })

  it('becomes unauthenticated when a session-expired event is emitted', async () => {
    authApiMock.login.mockResolvedValue(tokenPair)
    authApiMock.getCurrentUser.mockResolvedValue(sampleUser)

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))

    act(() => {
      screen.getByText('login').click()
    })
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'))

    act(() => {
      notifySessionExpired()
    })

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'))
  })
})

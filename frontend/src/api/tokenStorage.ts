/**
 * Token persistence is isolated behind this interface so that a future
 * backend using HttpOnly refresh cookies can be substituted without
 * touching the rest of the API client. See docs/SECURITY.md for the
 * rationale behind the current demo-compatible strategy:
 *
 *  - The access token lives only in memory (never persisted).
 *  - The refresh token lives in sessionStorage (not localStorage), so a
 *    single tab can restore its session across a reload, but the token
 *    never survives across browser restarts and is never shared with other
 *    origins or persisted indefinitely.
 */
export interface TokenStorage {
  getAccessToken(): string | null
  setAccessToken(token: string | null): void
  getRefreshToken(): string | null
  setRefreshToken(token: string | null): void
  clear(): void
}

const REFRESH_TOKEN_KEY = 'wst.refreshToken'

class InMemoryAccessWithSessionRefreshStorage implements TokenStorage {
  private accessToken: string | null = null

  getAccessToken(): string | null {
    return this.accessToken
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token
  }

  getRefreshToken(): string | null {
    try {
      return sessionStorage.getItem(REFRESH_TOKEN_KEY)
    } catch {
      return null
    }
  }

  setRefreshToken(token: string | null): void {
    try {
      if (token) {
        sessionStorage.setItem(REFRESH_TOKEN_KEY, token)
      } else {
        sessionStorage.removeItem(REFRESH_TOKEN_KEY)
      }
    } catch {
      // sessionStorage may be unavailable (private browsing); the session
      // simply will not survive a reload in that case.
    }
  }

  clear(): void {
    this.setAccessToken(null)
    this.setRefreshToken(null)
  }
}

export const tokenStorage: TokenStorage = new InMemoryAccessWithSessionRefreshStorage()

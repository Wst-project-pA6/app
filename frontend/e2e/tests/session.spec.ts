import { expect, test } from '@playwright/test'
import { loadSharedFixtures } from '../support/fixtures'
import { loginViaUI, logoutViaUI } from '../support/ui'

const fixtures = loadSharedFixtures()

test('a simulated 401 triggers a silent token refresh and retry, not a forced logout', async ({ page }) => {
  await loginViaUI(page, fixtures.secondaryUser.email, fixtures.secondaryUser.password)

  // Force exactly one 401 on the first matching request (simulating an
  // access token that expired mid-session — the real token is short-lived,
  // 10 minutes, too long to wait out in a test) and let every request after
  // that — including the client's own POST /auth/refresh and its retry of
  // this same request — go through to the real backend untouched. See
  // src/api/client.ts: a 401 on a non-auth request triggers exactly one
  // shared refresh-and-retry, never an immediate logout.
  let forced401 = false
  await page.route('**/api/v1/customers**', async (route) => {
    if (!forced401 && route.request().method() === 'GET') {
      forced401 = true
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'UNAUTHENTICATED',
          message: 'Simulated expired access token',
          requestId: 'e2e-simulated-401',
        }),
      })
      return
    }
    await route.continue()
  })

  await page.goto('/customers')

  // Silent refresh succeeded and the original request was retried: the list
  // renders, and the user is still authenticated — no redirect to /login.
  // (Asserted with auto-retrying `expect`, since the query — and therefore
  // the intercepted request — fires asynchronously after the route handler
  // is armed, not synchronously within `goto`.)
  await expect(page).toHaveURL(/\/customers$/)
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
  expect(forced401, 'the route handler should have intercepted at least one request').toBe(true)
})

test('logout clears the session and redirects to login', async ({ page }) => {
  await loginViaUI(page, fixtures.secondaryUser.email, fixtures.secondaryUser.password)

  const refreshTokenBefore = await page.evaluate(() => sessionStorage.getItem('wst.refreshToken'))
  expect(refreshTokenBefore).toBeTruthy()

  await logoutViaUI(page)

  const refreshTokenAfter = await page.evaluate(() => sessionStorage.getItem('wst.refreshToken'))
  expect(refreshTokenAfter).toBeNull()

  // The session is really gone, not just the visible route: a protected
  // page bounces straight back to /login instead of rendering.
  await page.goto('/customers')
  await expect(page).toHaveURL(/\/login$/)
})

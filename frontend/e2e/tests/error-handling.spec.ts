import { expect, test } from '@playwright/test'
import { loadSharedFixtures } from '../support/fixtures'
import { randomPhoneE164 } from '../support/testData'
import { loginViaUI } from '../support/ui'

const fixtures = loadSharedFixtures()

test('a real backend error response surfaces its code and request id, not a generic crash', async ({ page }) => {
  await loginViaUI(page, fixtures.secondaryUser.email, fixtures.secondaryUser.password)
  await page.goto('/customers/new')

  const simulatedRequestId = 'e2e-simulated-error-4471a9'
  const simulatedMessage = 'Simulated validation failure injected by the E2E error-handling test.'

  await page.route('**/api/v1/customers', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'VALIDATION_ERROR', message: simulatedMessage, requestId: simulatedRequestId }),
    })
  })

  // id-based, not getByLabel: see the note in support/ui.ts's loginViaUI.
  await page.locator('#customer-display-name').fill('E2E Error Handling Customer')
  await page.locator('#customer-phone').fill(randomPhoneE164())
  await page.locator('#customer-scope').selectOption(fixtures.branchScopeId)
  await page.getByRole('button', { name: 'Create customer' }).click()

  const alert = page.getByRole('alert')
  await expect(alert).toContainText(simulatedMessage)
  await expect(alert).toContainText(`Request ID: ${simulatedRequestId}`)

  // A real per-field/API error, not an unhandled crash: the render-error
  // boundary fallback never appears, and the form is still right there —
  // the user can just fix the request and resubmit.
  await expect(page.getByText('An unexpected error occurred while displaying this page.')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'New customer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create customer' })).toBeVisible()
})

import { expect, type Page } from '@playwright/test'

/**
 * Logs in through the real login form and waits for the shell to render.
 *
 * Uses id-based locators rather than getByLabel: Playwright 1.63's
 * `getByLabel(text, { exact: true })` fails to match a control whose
 * `<label>` has extra non-text content (this app's FormField appends an
 * aria-hidden required-marker `<span>` to every required field's label —
 * see src/components/FormField/FormField.tsx), even though the browser's
 * own accessible-name computation (and getByRole) handles it correctly.
 * Confirmed empirically against this app's actual DOM before standardizing
 * on ids everywhere in this suite.
 */
export async function loginViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // A successful login lands on the shell (home page or pending-access); in
  // both cases the account menu in the header is the reliable signal that
  // AuthProvider has finished restoring/authenticating.
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible({ timeout: 15_000 })
}

export async function logoutViaUI(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
}

/** Selects a job-detail tab by its accessible name (see src/components/Tabs/Tabs.tsx). */
export async function gotoJobTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name }).click()
}

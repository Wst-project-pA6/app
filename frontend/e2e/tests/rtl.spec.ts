import { expect, test } from '@playwright/test'
import { loadSharedFixtures } from '../support/fixtures'
import { loginViaUI } from '../support/ui'

const fixtures = loadSharedFixtures()

test('switching to Arabic mirrors the layout while keeping identifiers LTR', async ({ page }) => {
  await loginViaUI(page, fixtures.secondaryUser.email, fixtures.secondaryUser.password)

  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')

  await page.getByLabel('Language', { exact: true }).selectOption('ar')

  // Real i18n applied (not just a dir flip): the document direction and
  // lang attribute flip, and page text is now genuinely translated — see
  // src/i18n/index.ts's languageChanged -> applyDocumentDirection wiring.
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar')

  await page.goto('/jobs')
  await expect(page.getByRole('heading', { name: 'بطاقات العمل' })).toBeVisible()

  // Layout mirrors: the sidebar's inline-end border becomes its physical
  // left edge in RTL, so the main content column now sits to the sidebar's
  // *left*, not its right as in LTR.
  const sidebarBox = await page.locator('nav#primary-navigation').boundingBox()
  const mainBox = await page.locator('#main-content').boundingBox()
  expect(sidebarBox && mainBox && sidebarBox.x).toBeGreaterThan(mainBox?.x ?? Number.POSITIVE_INFINITY)

  // LTR-locked identifier columns (job numbers, VINs, plates, SKUs, invoice
  // numbers, amounts — see the `.dir-ltr` utility in src/styles/global.css)
  // must never mirror even though the surrounding page has flipped.
  const firstRow = page.locator('table tbody tr').first()
  await expect(firstRow).toBeVisible()
  const jobNumberCell = firstRow.locator('td').first()
  await expect(jobNumberCell).toHaveCSS('direction', 'ltr')
  await expect(jobNumberCell.getByText(/^JC-/)).toBeVisible()
})

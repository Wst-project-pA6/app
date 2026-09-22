import { expect, test, type Page } from '@playwright/test'
import { loadSharedFixtures } from '../support/fixtures'
import { loginViaUI } from '../support/ui'

const fixtures = loadSharedFixtures()

test.use({ viewport: { width: 390, height: 844 } }) // iPhone 12/13-ish width

/**
 * `scrollWidth` measures content size regardless of the `overflow` CSS
 * property, so it isn't a reliable "is this visibly broken" signal on this
 * app: the off-canvas mobile nav drawer is deliberately positioned outside
 * the viewport via `transform` when closed (see Sidebar.module.css), which
 * inflates `scrollWidth` by design even though nothing is actually visible
 * or reachable there.
 *
 * `window.scrollTo()` isn't a reliable signal either: CSS `overflow: hidden`
 * (src/styles/global.css, on the root element) blocks user-driven scrolling
 * — mouse wheel, touch drag, scrollbar — but by spec does NOT block
 * *programmatic* `scrollTo`/`scrollLeft`, so a script-based scroll attempt
 * "succeeds" even on a correctly-clipped page.
 *
 * What actually determines whether a real user could pan/scroll to reveal
 * cut-off content is the computed `overflow-x` of the document's scrolling
 * element — that's the real browser mechanism this app relies on to keep
 * the closed off-canvas drawer from being reachable by touch/trackpad.
 */
async function expectNoHorizontalPageOverflow(page: Page) {
  const overflowX = await page.evaluate(
    () => getComputedStyle(document.scrollingElement ?? document.documentElement).overflowX,
  )
  expect(
    ['hidden', 'clip'],
    "the document's scrolling element should clip horizontal overflow at mobile width",
  ).toContain(overflowX)
}

test('login, job list and job detail are usable at a mobile viewport', async ({ page }) => {
  await test.step('login', async () => {
    await loginViaUI(page, fixtures.secondaryUser.email, fixtures.secondaryUser.password)
    await expectNoHorizontalPageOverflow(page)
  })

  await test.step('the mobile nav drawer opens from the header hamburger button', async () => {
    // Below the 64rem breakpoint only the hamburger toggle is shown (see
    // Header.module.css's .desktopOnly rule) — the desktop sidebar-collapse
    // button is hidden entirely, not just redundant.
    await expect(page.getByRole('button', { name: 'Toggle navigation sidebar' })).toBeHidden()
    const jobsLink = page.getByRole('link', { name: 'Job Cards' })
    await expect(jobsLink).not.toBeInViewport()

    await page.getByRole('button', { name: 'Open navigation menu' }).click()
    await expect(jobsLink).toBeInViewport()
    await jobsLink.click()
  })

  await test.step('job list renders as a scrollable table, not a broken/overflowing page', async () => {
    await expect(page).toHaveURL(/\/jobs$/)
    await expect(page.getByRole('heading', { name: 'Job Cards' })).toBeVisible()
    await expect(page.locator('table tbody tr').first()).toBeVisible()
    await expectNoHorizontalPageOverflow(page)
  })

  await test.step('job detail tabs remain usable', async () => {
    await page.locator('table tbody tr').first().getByRole('link').first().click()
    await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]+$/)
    await expect(page.getByRole('tablist')).toBeVisible()
    await expectNoHorizontalPageOverflow(page)

    // The secondary account holds SERVICE_ADVISOR, which has approvals.read
    // but not labor.read — Approvals is the tab guaranteed visible to it
    // beyond the always-shown Overview/Work items (see JobDetailPage.tsx's
    // per-tab permission gating).
    const approvalsTab = page.getByRole('tab', { name: 'Approvals' })
    await approvalsTab.scrollIntoViewIfNeeded()
    await approvalsTab.click()
    await expect(approvalsTab).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tabpanel')).toBeVisible()
    await expectNoHorizontalPageOverflow(page)
  })
})

import { expect, test, type Page } from '@playwright/test'
import * as api from '../support/apiClient'
import { DEMO_ADMIN_EMAIL, DEMO_PASSWORD } from '../support/env'
import { loadSharedFixtures } from '../support/fixtures'
import { datetimeLocalInDays, randomPhoneE164, randomPlate, randomVin, todayDateOnly, uid } from '../support/testData'
import { loginViaUI } from '../support/ui'

const fixtures = loadSharedFixtures()

const journeyEmail = `e2e.journey.${Date.now()}.${uid()}@example.com`
const journeyPassword = 'E2eJourneyPass!2026'
const journeyDisplayName = 'E2E Journey User'
const customerDisplayName = `E2E Customer ${uid()}`
const vehiclePlate = randomPlate()
const vehicleVin = randomVin()
const vehicleMileage = 10_000
const jobComplaint = `Strange noise from engine bay (${uid()})`

let jobUrl: string
let jobNumber: string

test.describe.serial('Full workshop journey: register through delivery', () => {
  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
  })

  test.afterAll(async () => {
    await page.close()
  })

  test('register -> pending-access -> admin grants access via a real API call -> login', async () => {
    await test.step('register a new account through the UI', async () => {
      await page.goto('/register')
      await page.locator('#register-display-name').fill(journeyDisplayName)
      await page.locator('#register-email').fill(journeyEmail)
      await page.locator('#register-password').fill(journeyPassword)
      await page.locator('#register-confirm-password').fill(journeyPassword)
      await page.getByRole('button', { name: 'Create account' }).click()

      await expect(page).toHaveURL(/\/login$/)
      await expect(
        page.getByText('Account created. Sign in once an administrator has granted your access.'),
      ).toBeVisible()
    })

    await test.step('log in and land on the pending-access page (no role or scope yet)', async () => {
      await loginViaUI(page, journeyEmail, journeyPassword)
      await expect(page).toHaveURL(/\/pending-access$/)
      // PendingAccessPage renders via the shared EmptyState component, whose
      // title is a <p> (used across list "no results" states too), not a
      // heading — asserting on the text, not a heading role.
      await expect(page.getByText('Your account is awaiting access')).toBeVisible()
      await expect(page.getByText(journeyEmail, { exact: false })).toBeVisible()
    })

    await test.step('an administrator grants the role and organization scope via a real API call', async () => {
      // Design choice (documented per the task brief): self-registration
      // (POST /auth/register) always grants zero roles and zero scopes —
      // this is enforced server-side, not a UI omission (see
      // RegisterPage.tsx and D:\WST\backend\docs\DEMO_SEED.md, "The
      // bootstrap admin exception"). There is no UI for a brand-new account
      // to grant itself access, by design. The realistic way to unblock a
      // pending account is exactly what a real SYSTEM_ADMIN would do: sign
      // in and call PUT /users/{id}/roles and PUT /users/{id}/organization-
      // scopes. We use the backend's pre-seeded demo admin account
      // (demo.admin@demo.wst.local, see DEMO_SEED.md) to make that exact
      // real HTTP call here, rather than reaching into the database — this
      // is the same call the Access Management UI's role/scope editors make
      // for a `users.manage`/`roles.assign` holder.
      const adminToken = await api.login(DEMO_ADMIN_EMAIL, DEMO_PASSWORD)
      const userId = await api.findUserIdByEmail(adminToken, journeyEmail)
      await api.grantRoles(adminToken, userId, ['SERVICE_ADVISOR', 'WORKSHOP_MANAGER', 'TECHNICIAN', 'QUALITY_CHECKER'])
      await api.grantOrganizationScopes(adminToken, userId, [fixtures.branchScopeId, fixtures.storeScopeId])
    })

    await test.step('refreshing access on the pending-access page unblocks the app', async () => {
      await page.getByRole('button', { name: 'Refresh access' }).click()
      await expect(page).not.toHaveURL(/\/pending-access$/, { timeout: 15_000 })
      await expect(page.getByRole('heading', { name: `Welcome, ${journeyDisplayName}` })).toBeVisible()
    })
  })

  test('create customer -> vehicle -> job card with a work item', async () => {
    await test.step('create a customer', async () => {
      await page.goto('/customers/new')
      await page.locator('#customer-display-name').fill(customerDisplayName)
      await page.locator('#customer-phone').fill(randomPhoneE164())
      await page.locator('#customer-scope').selectOption(fixtures.branchScopeId)
      await page.getByRole('button', { name: 'Create customer' }).click()
      await expect(page.getByText('Customer created.')).toBeVisible()
      await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+$/)
    })

    await test.step('register a vehicle for that customer', async () => {
      await page.goto('/vehicles/new')
      await page.getByPlaceholder('Search customers').fill(customerDisplayName)
      await page.getByRole('button', { name: new RegExp(customerDisplayName) }).click()
      await page.locator('#vehicle-plate').fill(vehiclePlate)
      await page.locator('#vehicle-vin').fill(vehicleVin)
      await page.locator('#vehicle-make').fill('Toyota')
      await page.locator('#vehicle-model').fill('Corolla')
      await page.locator('#vehicle-mileage').fill(String(vehicleMileage))
      await page.getByRole('button', { name: 'Register vehicle' }).click()
      await expect(page.getByText('Vehicle registered.')).toBeVisible()
      await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]+$/)
    })

    await test.step('open a job card for that vehicle', async () => {
      await page.goto('/jobs/new')
      await page.getByPlaceholder('Search by plate, VIN, make or model').fill(vehiclePlate)
      await page.getByRole('button', { name: new RegExp(vehiclePlate) }).click()
      await page.locator('#job-complaint').fill(jobComplaint)
      await page.locator('#job-mileage').fill(String(vehicleMileage + 50))
      await page.locator('#job-expected-completion').fill(datetimeLocalInDays(3))
      await page.getByRole('button', { name: 'Open job card' }).click()
      await expect(page.getByText('Job card opened.')).toBeVisible()
      await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]+$/)
      jobUrl = page.url()
      // The heading shows a loading-state fallback ("Job card") until the
      // job query resolves — wait for the real jobNumber, not a fallback.
      const heading = page.getByRole('heading', { level: 1 })
      await expect(heading).toContainText(/^JC-/)
      jobNumber = (await heading.textContent())?.trim() ?? ''
    })

    await test.step('add a work item to the checklist', async () => {
      await page.getByRole('tab', { name: 'Work items' }).click()
      await page.getByRole('button', { name: 'Add checklist item' }).click()
      const dialog = page.getByRole('dialog')
      await dialog.locator('#work-item-description').fill('Inspect and replace oil filter')
      await dialog.getByRole('button', { name: 'Add checklist item' }).click()
      await expect(page.getByText('Checklist item added.')).toBeVisible()
      await expect(page.getByRole('row', { name: /Inspect and replace oil filter/ })).toBeVisible()
    })
  })

  test('assign bay/technician, record and approve the initial-work approval, start the job', async () => {
    await test.step('assign bay and technician', async () => {
      const adminToken = await api.login(DEMO_ADMIN_EMAIL, DEMO_PASSWORD)
      const technicianId = await api.findUserIdByEmail(adminToken, journeyEmail)

      await page.getByRole('tab', { name: 'Assignment' }).click()
      await page.locator('#assignment-bay').selectOption(fixtures.bay.id)
      await page.locator('#assignment-technician').selectOption(technicianId)
      await page.locator('#assignment-scheduled-start').fill(datetimeLocalInDays(0))
      await page.locator('#assignment-expected-completion').fill(datetimeLocalInDays(3))
      await page.getByRole('button', { name: 'Save assignment' }).click()
      await expect(page.getByText('Job assigned.')).toBeVisible()
    })

    await test.step('request and approve the initial-work customer approval', async () => {
      await page.getByRole('tab', { name: 'Approvals' }).click()
      await page.getByRole('button', { name: 'Request approval' }).click()
      const createDialog = page.getByRole('dialog')
      await createDialog.locator('#approval-description').fill('Customer approved initial diagnosis and repair')
      await createDialog.getByRole('button', { name: 'Request approval' }).click()
      await expect(page.getByText('Approval request created.')).toBeVisible()

      await page.getByRole('button', { name: 'Record decision' }).click()
      const decisionDialog = page.getByRole('dialog')
      await decisionDialog.locator('#decision-approved-by').fill('Customer Rep')
      await decisionDialog.getByRole('button', { name: 'Record decision' }).click()
      await expect(page.getByText('Decision recorded.')).toBeVisible()
      await expect(page.getByText('Approved', { exact: true })).toBeVisible()
    })

    await test.step('start the job (Received -> In progress)', async () => {
      await page.getByRole('tab', { name: 'Overview' }).click()
      await page.getByRole('button', { name: 'Move to In progress' }).click()
      await expect(page.getByText('Job moved to In progress.')).toBeVisible()
      await expect(page.getByText('Current stage: In progress')).toBeVisible()
    })
  })

  test('log labor, issue a part, complete the checklist, submit for quality check', async () => {
    await test.step('log labor', async () => {
      await page.getByRole('tab', { name: 'Labor' }).click()
      await page.getByRole('button', { name: 'Log labor' }).click()
      const dialog = page.getByRole('dialog')
      await dialog.locator('#labor-duration').fill('45')
      await dialog.locator('#labor-description').fill('Replaced oil filter')
      await dialog.getByRole('button', { name: 'Log labor' }).click()
      await expect(page.getByText('Labor logged.')).toBeVisible()
    })

    await test.step('issue a part', async () => {
      await page.getByRole('tab', { name: 'Parts' }).click()
      await page.getByRole('button', { name: 'Issue part' }).click()
      const dialog = page.getByRole('dialog')
      await dialog.locator('#issue-part').selectOption(fixtures.part.id)
      await dialog.locator('#issue-store').selectOption(fixtures.store.id)
      await dialog.locator('#issue-quantity').fill('1')
      await dialog.getByRole('button', { name: 'Issue part' }).click()
      await expect(page.getByText('Part issued.')).toBeVisible()
      await expect(page.getByRole('row', { name: new RegExp(fixtures.part.sku) })).toBeVisible()
    })

    await test.step('mark the work item done', async () => {
      await page.getByRole('tab', { name: 'Work items' }).click()
      await page.getByRole('button', { name: 'Mark done' }).click()
      await expect(page.getByText('Checklist item updated.')).toBeVisible()
      await expect(page.getByRole('row', { name: /Inspect and replace oil filter/ })).toContainText('Done')
    })

    await test.step('submit the job for quality check', async () => {
      await page.getByRole('tab', { name: 'Overview' }).click()
      await page.getByRole('button', { name: 'Move to Quality check' }).click()
      await expect(page.getByText('Job moved to Quality check.')).toBeVisible()
    })
  })

  test('record a passing quality check; job reaches Ready and the invoice is auto-created', async () => {
    await test.step('record a passing quality check', async () => {
      await page.getByRole('tab', { name: 'Quality' }).click()
      await page.getByRole('button', { name: 'Record quality check' }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('button', { name: 'Record quality check' }).click()
      await expect(page.getByText('Quality check recorded.')).toBeVisible()
      await expect(page.getByRole('row', { name: /Passed/ })).toBeVisible()
    })

    await test.step('move the job to Ready (auto-creates the draft invoice)', async () => {
      await page.getByRole('tab', { name: 'Overview' }).click()
      await page.getByRole('button', { name: 'Move to Ready' }).click()
      await expect(page.getByText('Job moved to Ready.')).toBeVisible()
    })

    await test.step('the invoice preview shows the labor and part lines', async () => {
      await page.getByRole('tab', { name: 'Invoice' }).click()
      await expect(page.getByRole('row', { name: /LABOR/ })).toBeVisible()
      await expect(page.getByRole('row', { name: /PART/ })).toBeVisible()
    })
  })

  test('issue the invoice and record the exact payment', async () => {
    await test.step("find the job's draft invoice from the invoice list", async () => {
      await page.goto('/invoices')
      const row = page.getByRole('row', { name: new RegExp(jobNumber) })
      await expect(row).toBeVisible()
      await row.getByRole('link', { name: 'Draft' }).click()
      await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/)
    })

    await test.step('issue the invoice', async () => {
      await page.getByRole('button', { name: 'Issue invoice' }).click()
      await expect(page.getByText('Invoice status updated.')).toBeVisible()
      await expect(page.getByText('ISSUED', { exact: true })).toBeVisible()
    })

    await test.step('record the exact payment (amount pre-filled to the invoice total)', async () => {
      await page.locator('#payment-reference').fill(`E2E-PAY-${uid()}`)
      await page.getByRole('button', { name: 'Record payment' }).click()
      await expect(page.getByText('Payment recorded.')).toBeVisible()
      await expect(page.getByText('PAID', { exact: true })).toBeVisible()
    })
  })

  test('deliver the job', async () => {
    await page.goto(jobUrl)
    await page.getByRole('tab', { name: 'Overview' }).click()
    await page.getByRole('button', { name: 'Move to Delivered' }).click()
    await expect(page.getByText('Job moved to Delivered.')).toBeVisible()
    await expect(page.getByText('Current stage: Delivered')).toBeVisible()
    await expect(page.getByText('No stage actions are available to you right now.')).toBeVisible()
  })

  test('refreshing the page confirms all state persisted on the server (not just in memory)', async () => {
    // Exactly one hard reload: the previous test already ended on jobUrl, so
    // reloading here (rather than an extra goto()+reload() back to back) is
    // both the realistic "user hits refresh" scenario and avoids racing two
    // overlapping restore-refresh cycles against the single-use refresh
    // token across two separate page teardowns.
    await page.reload()

    // The access token lives only in memory and is wiped by the reload; the
    // refresh token in sessionStorage is what survives it (see
    // src/api/tokenStorage.ts). Staying authenticated and seeing the job's
    // final, server-computed state after a hard reload is the real proof
    // that everything above landed in Postgres, not just in React state.
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: jobNumber })).toBeVisible()
    await expect(page.getByText('Current stage: Delivered')).toBeVisible()

    await page.getByRole('tab', { name: 'Invoice' }).click()
    await expect(page.getByRole('row', { name: /LABOR/ })).toBeVisible()
    await expect(page.getByRole('row', { name: /PART/ })).toBeVisible()

    await page.getByRole('tab', { name: 'History' }).click()
    await expect(page.getByText(todayDateOnly().slice(0, 4), { exact: false }).first()).toBeVisible()
  })
})

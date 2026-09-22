/**
 * Runs once before the whole suite. Resolves shared reference data (an
 * organization scope with bays, a part with a store) from the backend's
 * demo seed, tops up stock for that part so the journey test can issue it,
 * and provisions one secondary test account reused by the session/
 * error-handling/RTL/mobile specs (which only need *a* logged-in account,
 * not to exercise the register→pending-access→grant flow themselves — the
 * main journey spec does that live, registering its own account).
 *
 * This keeps login volume against the backend's per-account/per-IP rate
 * limiters low and deterministic: the demo admin, manager and storekeeper
 * accounts each log in exactly once, here, for the entire run.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  findUserIdByEmail,
  grantOrganizationScopes,
  grantRoles,
  listActiveBays,
  listOrganizationScopes,
  listParts,
  listStores,
  login,
  registerUser,
  topUpStock,
} from './apiClient'
import {
  BACKEND_API_BASE_URL,
  DEMO_ADMIN_EMAIL,
  DEMO_MANAGER_EMAIL,
  DEMO_PASSWORD,
  DEMO_STOREKEEPER_EMAIL,
} from './env'
import { uid } from './testData'

async function assertBackendReachable(): Promise<void> {
  try {
    // Any response (even 401) proves the backend is up; a network failure
    // means it is not running at all.
    await fetch(`${BACKEND_API_BASE_URL}/roles`)
  } catch (cause) {
    throw new Error(
      `Could not reach the backend at ${BACKEND_API_BASE_URL}. Start it first (D:\\WST\\backend, ` +
        `branch backend/demo-dataset-media: "npm run start:dev", with the demo seed applied via ` +
        `"npm run seed"). Set E2E_API_BASE_URL to point elsewhere if it runs somewhere other than ` +
        `http://localhost:3000/api/v1.\nCause: ${String(cause)}`,
    )
  }
}

export interface SharedFixtures {
  branchScopeId: string
  storeScopeId: string
  bay: { id: string; code: string }
  part: { id: string; sku: string }
  store: { id: string; name: string }
  secondaryUser: { email: string; password: string; userId: string }
}

export const FIXTURES_PATH = path.join(import.meta.dirname, '..', '.auth', 'fixtures.json')

export default async function globalSetup(): Promise<void> {
  await assertBackendReachable()

  const adminToken = await login(DEMO_ADMIN_EMAIL, DEMO_PASSWORD)

  const scopes = await listOrganizationScopes(adminToken)
  const branch = scopes.find(
    (scope) => scope.type === 'BRANCH' && scope.code.startsWith('DEMO-BR') && scope.status === 'ACTIVE',
  )
  const store = scopes.find((scope) => scope.type === 'STORE' && scope.status === 'ACTIVE')
  if (!branch || !store) {
    throw new Error(
      'Could not find a demo BRANCH and STORE organization scope. Run "npm run seed" in the backend (branch backend/demo-dataset-media) first.',
    )
  }

  // SYSTEM_ADMIN deliberately holds none of bays.read/parts.read/inventory.read
  // (see the role→permission dump in DEMO_SEED.md's design) — it can grant
  // roles/scopes but not operate the workshop. WORKSHOP_MANAGER can, so the
  // demo manager account resolves bays/parts/stores instead.
  const storekeeperToken = await login(DEMO_STOREKEEPER_EMAIL, DEMO_PASSWORD)
  const managerToken = await login(DEMO_MANAGER_EMAIL, DEMO_PASSWORD)

  const bays = await listActiveBays(managerToken)
  const bay = bays.find((item) => item.organizationScopeId === branch.id)
  if (!bay)
    throw new Error(`No active bay found for organization scope ${branch.code}. Run the backend demo seed first.`)

  const parts = await listParts(managerToken)
  const stores = await listStores(managerToken)
  const storeRecord = stores.find((item) => item.organizationScopeId === store.id) ?? stores[0]
  const partRecord = parts[0]
  if (!partRecord || !storeRecord) {
    throw new Error(
      'No parts/stores found. Run "npm run seed" in the backend (branch backend/demo-dataset-media) first.',
    )
  }

  // Top up stock via the real stock-adjustment workflow (a different account
  // must request vs. approve — see apiClient.topUpStock) so the journey
  // spec's part-issuance step never hits INSUFFICIENT_STOCK regardless of
  // how much prior demo/job activity has already consumed this store's
  // on-hand quantity.
  await topUpStock(storekeeperToken, managerToken, storeRecord.id, partRecord.id, 25)

  // One secondary account, reused (read-only-ish usage) across the session,
  // error-handling, RTL and mobile specs.
  const secondaryEmail = `e2e.secondary.${Date.now()}.${uid()}@example.com`
  const secondaryPassword = 'E2eSecondary!2026Pass'
  await registerUser('E2E Secondary User', secondaryEmail, secondaryPassword)
  const secondaryUserId = await findUserIdByEmail(adminToken, secondaryEmail)
  await grantRoles(adminToken, secondaryUserId, ['SERVICE_ADVISOR'])
  await grantOrganizationScopes(adminToken, secondaryUserId, [branch.id])

  const fixtures: SharedFixtures = {
    branchScopeId: branch.id,
    storeScopeId: store.id,
    bay: { id: bay.id, code: bay.code },
    part: { id: partRecord.id, sku: partRecord.sku },
    store: { id: storeRecord.id, name: storeRecord.name },
    secondaryUser: { email: secondaryEmail, password: secondaryPassword, userId: secondaryUserId },
  }

  mkdirSync(path.dirname(FIXTURES_PATH), { recursive: true })
  writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2))
}

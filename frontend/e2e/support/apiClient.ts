/**
 * Minimal, dependency-free REST client used only by test setup code
 * (globalSetup.ts) to talk directly to the real backend — creating and
 * promoting test accounts, and topping up inventory stock — before the
 * browser is ever opened. Every call here hits the same real, permission
 * checked HTTP API the app itself uses; nothing is mocked or written
 * directly to the database.
 */
import { BACKEND_API_BASE_URL } from './env'

export interface Money {
  amount: string
  currency: string
}

export class SetupApiError extends Error {
  readonly method: string
  readonly path: string
  readonly status: number
  readonly body: unknown

  constructor(method: string, path: string, status: number, body: unknown) {
    super(`${method} ${path} failed with ${status}: ${JSON.stringify(body)}`)
    this.name = 'SetupApiError'
    this.method = method
    this.path = path
    this.status = status
    this.body = body
  }
}

async function call<T>(method: string, path: string, token: string | undefined, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${BACKEND_API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await response.text()
  const parsed: unknown = text ? JSON.parse(text) : undefined

  if (!response.ok) {
    throw new SetupApiError(method, path, response.status, parsed)
  }

  return parsed as T
}

export async function login(email: string, password: string): Promise<string> {
  const result = await call<{ accessToken: string }>('POST', '/auth/login', undefined, { email, password })
  return result.accessToken
}

export interface RegisteredAccount {
  email: string
  password: string
}

export async function registerUser(displayName: string, email: string, password: string): Promise<RegisteredAccount> {
  await call<void>('POST', '/auth/register', undefined, {
    displayName,
    email,
    preferredLocale: 'en',
    password,
  })
  return { email, password }
}

interface UserSummary {
  id: string
  email: string
}

interface UserPage {
  items: UserSummary[]
}

/** Self-registration never returns the new user's id, so look it up as the admin. */
export async function findUserIdByEmail(adminToken: string, email: string): Promise<string> {
  const page = await call<UserPage>('GET', `/users?q=${encodeURIComponent(email)}`, adminToken)
  const match = page.items.find((item) => item.email === email)
  if (!match) throw new Error(`User ${email} not found via GET /users (registration may not have completed)`)
  return match.id
}

export async function grantRoles(adminToken: string, userId: string, roles: string[]): Promise<void> {
  await call<unknown>('PUT', `/users/${userId}/roles`, adminToken, { roles })
}

export async function grantOrganizationScopes(
  adminToken: string,
  userId: string,
  organizationScopeIds: string[],
): Promise<void> {
  await call<unknown>('PUT', `/users/${userId}/organization-scopes`, adminToken, { organizationScopeIds })
}

export interface OrganizationScope {
  id: string
  code: string
  name: string
  type: 'BRANCH' | 'STORE' | 'TRAINING_PROGRAM'
  status: string
}

export async function listOrganizationScopes(adminToken: string): Promise<OrganizationScope[]> {
  const page = await call<{ items: OrganizationScope[] }>('GET', '/organization-scopes?pageSize=50', adminToken)
  return page.items
}

export interface Bay {
  id: string
  code: string
  organizationScopeId: string
  status: string
}

export async function listActiveBays(token: string): Promise<Bay[]> {
  const page = await call<{ items: Bay[] }>('GET', '/bays?pageSize=50&status=ACTIVE', token)
  return page.items
}

export interface Part {
  id: string
  sku: string
}

export async function listParts(token: string): Promise<Part[]> {
  const page = await call<{ items: Part[] }>('GET', '/parts?pageSize=20&status=ACTIVE', token)
  return page.items
}

export interface Store {
  id: string
  code: string
  name: string
  organizationScopeId: string
}

export async function listStores(token: string): Promise<Store[]> {
  const page = await call<{ items: Store[] }>('GET', '/stores?pageSize=20&status=ACTIVE', token)
  return page.items
}

export interface StockBalance {
  storeId: string
  partId: string
  onHand: number
  available: number
}

export async function getStockBalance(
  token: string,
  storeId: string,
  partId: string,
): Promise<StockBalance | undefined> {
  const page = await call<{ items: StockBalance[] }>('GET', '/stock-balances?pageSize=50', token)
  return page.items.find((item) => item.storeId === storeId && item.partId === partId)
}

/**
 * Adds stock via a real stock adjustment (requester + approver must be
 * different accounts — the backend enforces separation of duties — so this
 * always uses the demo storekeeper/manager pair, never the journey's own
 * test user).
 */
export async function topUpStock(
  storekeeperToken: string,
  managerToken: string,
  storeId: string,
  partId: string,
  quantityDelta: number,
): Promise<void> {
  const adjustment = await call<{ id: string }>('POST', '/stock-adjustments', storekeeperToken, {
    storeId,
    partId,
    quantityDelta,
    reasonCode: 'FOUND',
    note: 'E2E test stock top-up',
  })
  await call<unknown>('POST', `/stock-adjustments/${adjustment.id}/decision`, managerToken, {
    decision: 'APPROVED',
  })
}

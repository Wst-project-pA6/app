/**
 * Central environment configuration for the E2E suite. Every value has a
 * sensible default matching this repo's documented local dev setup (Vite
 * dev server on :5173 proxying /api to the NestJS backend on :3000, and the
 * backend's demo seed accounts — see D:\WST\backend\docs\DEMO_SEED.md).
 * Override via environment variables to point at a different environment.
 */

function readEnv(name: string, fallback: string): string {
  const value = process.env[name]
  return value && value.length > 0 ? value : fallback
}

export const FRONTEND_BASE_URL = readEnv('E2E_BASE_URL', 'http://localhost:5173')

/**
 * Direct backend URL used ONLY by the Node-side setup helpers (apiClient.ts,
 * globalSetup.ts) to provision test data before the browser ever opens. The
 * app under test itself always talks to the backend through VITE_API_BASE_URL
 * / the Vite dev proxy, exactly as it would in production — this constant
 * never reaches browser code.
 */
export const BACKEND_API_BASE_URL = readEnv('E2E_API_BASE_URL', 'http://localhost:3000/api/v1')

/**
 * Demo seed credentials (see docs/DEMO_SEED.md in the backend repo). The
 * suite uses the pre-seeded SYSTEM_ADMIN account to grant roles/scopes to
 * freshly self-registered test users — see e2e/support/globalSetup.ts for
 * why this is the realistic choice rather than a test-only shortcut.
 */
export const DEMO_PASSWORD = readEnv('E2E_DEMO_PASSWORD', 'DemoPass!2026Seed')
export const DEMO_ADMIN_EMAIL = readEnv('E2E_ADMIN_EMAIL', 'demo.admin@demo.wst.local')
export const DEMO_MANAGER_EMAIL = readEnv('E2E_MANAGER_EMAIL', 'demo.manager@demo.wst.local')
export const DEMO_STOREKEEPER_EMAIL = readEnv('E2E_STOREKEEPER_EMAIL', 'demo.storekeeper@demo.wst.local')

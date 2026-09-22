import { defineConfig, devices } from '@playwright/test'
import { FRONTEND_BASE_URL } from './e2e/support/env'

/**
 * E2E suite configuration. Runs against real, already-running dev servers
 * (frontend + backend) — nothing here mocks the API. See e2e/README.md (and
 * docs/DEPLOYMENT.md's CI section) for exactly how to run it.
 *
 * Deliberately serial (workers: 1, fullyParallel: false): every test talks
 * to the same shared Postgres-backed dev backend and the same handful of
 * demo accounts, which are subject to real login rate limiting (see
 * D:\WST\backend\src\modules\auth\login-rate-limiter.ts). Parallel workers
 * would multiply login attempts against those accounts and risk 429s, and
 * buys little here since this is a correctness suite, not a load test.
 */
export default defineConfig({
  testDir: './e2e/tests',
  globalSetup: './e2e/support/globalSetup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: FRONTEND_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})

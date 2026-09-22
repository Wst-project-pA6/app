import { readFileSync } from 'node:fs'
import { FIXTURES_PATH, type SharedFixtures } from './globalSetup'

export function loadSharedFixtures(): SharedFixtures {
  return JSON.parse(readFileSync(FIXTURES_PATH, 'utf8')) as SharedFixtures
}

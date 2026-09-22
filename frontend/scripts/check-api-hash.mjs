// Verifies that openapi/wst-openapi.yaml has not drifted from the frozen
// contract snapshot recorded in docs/openapi-contract.md, and that the
// generated TypeScript types are up to date with that file.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const contractPath = path.join(rootDir, 'openapi', 'wst-openapi.yaml')
const docsPath = path.join(rootDir, 'docs', 'openapi-contract.md')
const generatedPath = path.join(rootDir, 'src', 'api', 'generated', 'schema.d.ts')

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

const actualHash = sha256(contractPath)
const docsContent = readFileSync(docsPath, 'utf8')
const match = /SHA-256:\s*`?([0-9a-f]{64})`?/i.exec(docsContent)

if (!match) {
  console.error(`Could not find a recorded SHA-256 hash in ${docsPath}`)
  process.exit(1)
}

const recordedHash = match[1].toLowerCase()

if (actualHash !== recordedHash) {
  console.error('openapi/wst-openapi.yaml has drifted from the recorded frozen-contract hash.')
  console.error(`  recorded: ${recordedHash}`)
  console.error(`  actual:   ${actualHash}`)
  console.error(`Update ${docsPath} only if the contract change is intentional and approved.`)
  process.exit(1)
}

console.log(`Contract hash OK: ${actualHash}`)

const before = readFileSync(generatedPath, 'utf8')
execFileSync(
  process.execPath,
  [path.join(rootDir, 'node_modules', 'openapi-typescript', 'bin', 'cli.js'), contractPath, '-o', generatedPath],
  { stdio: 'inherit' },
)
const after = readFileSync(generatedPath, 'utf8')

if (before !== after) {
  console.error(
    'src/api/generated/schema.d.ts is stale relative to openapi/wst-openapi.yaml. ' +
      'Run "npm run api:generate" and commit the result.',
  )
  process.exit(1)
}

console.log('Generated API types are up to date.')

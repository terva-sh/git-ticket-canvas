import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('parity gate runs each check separately so variadic recipes cannot swallow checks', () => {
  const result = spawnSync('just', ['--dry-run', 'parity-check'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual((result.stdout + result.stderr).trim().split('\n'), [
    'just dist-verify',
    'just web-setup',
    'just web-typecheck',
    'just web-test',
    'just tooling-test',
    'just fmt-check',
    'just vet',
    'just test',
    'just tickets-check',
    'just browser-test-embedded',
    'just go-only-check',
  ])
})

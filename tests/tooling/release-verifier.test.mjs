import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('release safety checks: release_verifier_test.py', () => {
  const result = spawnSync('python3', ['-B', 'tests/tooling/release_verifier_test.py'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

for (const script of ['release_verifier_test.py', 'publish_forgejo_test.py']) {
  test(`release safety checks: ${script}`, () => {
    const result = spawnSync('python3', ['-B', 'tests/tooling/' + script], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stdout + result.stderr)
  })
}

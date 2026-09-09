import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { verify } from '../../scripts/verify-dist.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'dist-verifier-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'web/dist/assets'), { recursive: true })
  writeFileSync(join(root, 'web/dist/index.html'), 'original html')
  writeFileSync(join(root, 'web/dist/assets/app.js'), 'original js')
  writeFileSync(join(root, '.gitignore'), '*.ignored\n')
  const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
  git(['init', '-q'])
  git(['add', 'web/dist', '.gitignore'])
  git(['-c', 'user.name=Verifier test', '-c', 'user.email=verifier@example.invalid', 'commit', '-qm', 'Fixture'])
  return root
}

const rebuild = (root, scratch) => cpSync(join(root, 'web'), join(scratch, 'web'), { recursive: true })

test('matching rebuild leaves working assets intact and removes scratch', t => {
  const root = fixture(t)
  let temp
  verify(root, (source, scratch) => { temp = scratch; rebuild(source, scratch) })
  assert.equal(readFileSync(join(root, 'web/dist/index.html'), 'utf8'), 'original html')
  assert.equal(existsSync(temp), false)
})

for (const [name, mutate, message] of [
  ['changed', path => writeFileSync(join(path, 'index.html'), 'stale'), /changed index.html/],
  ['missing', path => rmSync(join(path, 'assets/app.js')), /missing assets\/app.js/],
  ['extra', path => writeFileSync(join(path, 'extra.js'), 'extra'), /extra extra.js/],
  ['ignored extra', path => writeFileSync(join(path, 'extra.ignored'), 'extra'), /extra extra.ignored/],
  ['absent directory', path => rmSync(path, { recursive: true }), /missing index.html/],
]) {
  test(`rejects ${name} working assets before a build can overwrite them`, t => {
    const root = fixture(t)
    mutate(join(root, 'web/dist'))
    assert.throws(() => verify(root, () => assert.fail('must not build')), message)
  })
  test(`rejects ${name} rebuilt assets and cleans scratch on failure`, t => {
    const root = fixture(t)
    let temp
    assert.throws(() => verify(root, (source, scratch) => {
      temp = scratch
      rebuild(source, scratch)
      mutate(join(scratch, 'web/dist'))
    }), message)
    assert.equal(existsSync(temp), false)
    assert.equal(readFileSync(join(root, 'web/dist/index.html'), 'utf8'), 'original html')
  })
}

test('build failure propagates and cleans scratch', t => {
  const root = fixture(t)
  let temp
  assert.throws(() => verify(root, (_, scratch) => { temp = scratch; throw new Error('build failed') }), /build failed/)
  assert.equal(existsSync(temp), false)
})

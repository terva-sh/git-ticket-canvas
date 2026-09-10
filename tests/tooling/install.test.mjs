import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const cache = JSON.parse(execFileSync('go', ['env', '-json', 'GOCACHE', 'GOPATH'], { encoding: 'utf8' }))
function fixture(t, inherited = process.env) {
  const home = mkdtempSync(join(tmpdir(), 'canvas-install-test-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const env = { ...inherited, ...cache, HOME: home, GIT_CONFIG_GLOBAL: '/dev/null',
    XDG_CONFIG_HOME: join(home, '.config') }
  // go telemetry off uses the default config path, not this Go test override.
  delete env.TEST_TELEMETRY_DIR
  // A fast-failing go build can leave a detached telemetry writer behind.
  // Disable it before any build, only in this fixture's private telemetry dir.
  execFileSync('go', ['telemetry', 'off'], { env, timeout: 30_000 })
  return { home, env }
}
function install(env, args = []) {
  return spawnSync('bash', ['scripts/install-local.sh', ...args], { env, encoding: 'utf8', timeout: 120_000 })
}
function passed(result) { assert.equal(result.status, 0, result.stderr) }

test('fixture disables Go telemetry before builds without changing inherited configuration', t => {
  const outside = mkdtempSync(join(tmpdir(), 'canvas-install-inherited-'))
  t.after(() => rmSync(outside, { recursive: true, force: true }))
  const telemetry = join(outside, 'telemetry'), config = join(outside, 'config')
  mkdirSync(telemetry)
  mkdirSync(config)
  writeFileSync(join(telemetry, 'mode'), 'off\n')
  writeFileSync(join(config, 'sentinel'), 'keep config')
  const { home, env } = fixture(t, { ...process.env, XDG_CONFIG_HOME: config, TEST_TELEMETRY_DIR: telemetry })
  const state = JSON.parse(execFileSync('go', ['env', '-json', 'GOTELEMETRY', 'GOTELEMETRYDIR'], { env, encoding: 'utf8' }))
  assert.equal(state.GOTELEMETRY, 'off')
  assert.ok(state.GOTELEMETRYDIR.startsWith(home + '/'), state.GOTELEMETRYDIR)
  assert.equal(env.TEST_TELEMETRY_DIR, undefined)
  assert.equal(env.XDG_CONFIG_HOME, join(home, '.config'))
  const result = install({ ...env, GOFLAGS: '-not-a-real-go-flag' }, [join(home, 'bin')])
  assert.notEqual(result.status, 0)
  // Mode must be off before the fast-failing Go process can start a sidecar.
  assert.deepEqual(readdirSync(state.GOTELEMETRYDIR), ['mode'])
  assert.equal(readFileSync(join(telemetry, 'mode'), 'utf8'), 'off\n')
  assert.deepEqual(readdirSync(telemetry), ['mode'])
  assert.equal(readFileSync(join(config, 'sentinel'), 'utf8'), 'keep config')
  assert.deepEqual(readdirSync(config), ['sentinel'])
})

test('default install ignores GOBIN, replaces atomically, and is discoverable by Git', t => {
  const { home, env } = fixture(t), dest = join(home, '.local/bin')
  env.PATH = dest + ':' + env.PATH
  env.GOBIN = join(home, 'unused')
  mkdirSync(dest, { recursive: true })
  const binary = join(dest, 'git-ticket-canvas')
  writeFileSync(binary, 'old binary', { mode: 0o755 })
  const oldInode = statSync(binary).ino
  passed(install(env))
  assert.notEqual(statSync(binary).ino, oldInode)
  assert.equal(statSync(binary).mode & 0o777, 0o755)
  assert.deepEqual(readdirSync(dest), ['git-ticket-canvas'])
  const help = spawnSync('git', ['ticket-canvas', '-h'], { env, cwd: home, encoding: 'utf8' })
  passed(help)
  assert.match(help.stderr, /git-ticket-canvas/)
})

test('falls back to ~/bin and warns when destination is absent from PATH', t => {
  const { home, env } = fixture(t)
  writeFileSync(join(home, '.local'), 'not a directory')
  const result = install(env)
  passed(result)
  assert.ok(statSync(join(home, 'bin/git-ticket-canvas')).isFile())
  assert.match(result.stderr, /not on PATH/)
})

test('explicit destination with spaces wins and shadowing warns without deleting the other copy', t => {
  const { home, env } = fixture(t), first = join(home, 'first'), dest = join(home, 'chosen bin')
  mkdirSync(first)
  writeFileSync(join(first, 'git-ticket-canvas'), 'old copy', { mode: 0o755 })
  env.PATH = first + ':' + dest + ':' + env.PATH
  const result = install(env, [dest])
  passed(result)
  assert.ok(statSync(join(dest, 'git-ticket-canvas')).isFile())
  assert.match(result.stderr, /comes first on PATH/)
  assert.equal(readFileSync(join(first, 'git-ticket-canvas'), 'utf8'), 'old copy')
})

test('build failure preserves the installed binary and leaves no staging file', t => {
  const { home, env } = fixture(t), dest = join(home, 'bin')
  mkdirSync(dest)
  writeFileSync(join(dest, 'git-ticket-canvas'), 'keep me')
  const result = install({ ...env, GOFLAGS: '-not-a-real-go-flag' }, [dest])
  assert.notEqual(result.status, 0)
  assert.equal(readFileSync(join(dest, 'git-ticket-canvas'), 'utf8'), 'keep me')
  assert.deepEqual(readdirSync(dest), ['git-ticket-canvas'])
})

test('refuses unusable destinations rather than silently choosing another one', t => {
  const { home, env } = fixture(t)
  writeFileSync(join(home, '.local'), 'blocked')
  writeFileSync(join(home, 'bin'), 'blocked')
  assert.match(install(env).stderr, /neither .* is writable/)
  const result = install(env, [join(home, 'bin')])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /cannot create/)
})

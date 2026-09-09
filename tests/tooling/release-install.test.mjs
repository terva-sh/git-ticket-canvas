import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const installer = resolve('install.sh')
const repository = 'terva-sh/git-ticket-canvas'
const latestURL = `https://api.github.com/repos/${repository}/releases/latest`
const locate = name => spawnSync('/bin/sh', ['-c', 'command -v "$1"', 'sh', name], { encoding: 'utf8' }).stdout.trim()
const realTools = Object.fromEntries(['tar', 'cp', 'chmod', 'mv'].map(name => [name, locate(name)]))
const binaryContents = '#!/bin/sh\nprintf "git-ticket-canvas v1.2.3\\n"\n'

// The installer sees only this tool directory. curl has no network code and
// accepts only exact fixture URLs, so these tests cannot download a release.
const mockTool = `
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const env = process.env;
const tool = path.basename(process.argv[1]);
fs.appendFileSync(env.FIXTURE_LOG, JSON.stringify({ tool, args }) + '\\n');
if (env.FAIL_TOOL === tool) process.exit(1);
if (tool === 'uname') {
  process.stdout.write((args[0] === '-s' ? env.FIXTURE_OS : env.FIXTURE_ARCH) + '\\n');
} else if (tool === 'curl') {
  if (args.length !== 4 || args[0] !== '-fsSL' || args[1] !== '-o') process.exit(2);
  const routes = JSON.parse(fs.readFileSync(env.FIXTURE_ROUTES, 'utf8'));
  const source = routes[args[3]];
  if (!source || !fs.existsSync(source)) process.exit(22);
  fs.copyFileSync(source, args[2]);
} else {
  const result = spawnSync(JSON.parse(env.FIXTURE_REAL_TOOLS)[tool], args, { stdio: 'inherit', env });
  process.exit(result.status ?? 1);
}
`

function fixture(t, { os = 'Linux', arch = 'x86_64', tag = 'v1.2.3', hash, member = 'git-ticket-canvas', symlink = false } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'canvas release install ')))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const home = join(root, 'home with spaces'), tools = join(root, 'tools'), temp = join(root, 'temporary files')
  const payload = join(root, 'payload'), downloads = join(root, 'downloads')
  for (const dir of [home, tools, temp, payload, downloads]) mkdirSync(dir)
  for (const name of ['awk', 'sed', 'mktemp', 'mkdir', 'rm', 'gzip']) {
    const executable = locate(name)
    assert.ok(executable, `${name} is required by the test fixture`)
    symlinkSync(executable, join(tools, name))
  }
  for (const name of hash === 'none' ? [] : hash ? [hash] : ['sha256sum', 'shasum']) {
    const executable = locate(name)
    if (executable) symlinkSync(executable, join(tools, name))
  }
  for (const name of ['curl', 'uname', ...Object.keys(realTools)]) {
    writeFileSync(join(tools, name), `#!${process.execPath}\n${mockTool}`, { mode: 0o755 })
  }
  // No sudo, Go, Node, or Python command is exposed to install.sh on PATH.
  const assetOS = os === 'Darwin' ? 'darwin' : 'linux'
  const assetArch = ['arm64', 'aarch64'].includes(arch) ? 'arm64' : 'amd64'
  const asset = `git-ticket-canvas_${tag.replace(/^v/, '')}_${assetOS}_${assetArch}.tar.gz`
  if (symlink) symlinkSync('/nonexistent-canvas-fixture', join(payload, member))
  else writeFileSync(join(payload, member), binaryContents, { mode: 0o644 })
  const archive = join(downloads, asset)
  execFileSync(realTools.tar, ['-czf', archive, '-C', payload, member])
  const digest = createHash('sha256').update(readFileSync(archive)).digest('hex')
  const checksumFile = join(downloads, 'checksums.txt'), apiFile = join(downloads, 'release.json')
  writeFileSync(checksumFile, `${digest}  ${asset}\n${'0'.repeat(64)}  unrelated-asset.tar.gz\n`)
  writeFileSync(apiFile, JSON.stringify({ tag_name: tag, prerelease: false }))
  const base = `https://github.com/${repository}/releases/download/${tag}`
  const routes = { [latestURL]: apiFile, [`${base}/${asset}`]: archive, [`${base}/checksums.txt`]: checksumFile }
  const routeFile = join(root, 'routes.json'), logFile = join(root, 'calls.jsonl')
  writeFileSync(routeFile, JSON.stringify(routes))
  const env = {
    ...process.env, HOME: home, PATH: tools, TMPDIR: temp,
    FIXTURE_OS: os, FIXTURE_ARCH: arch, FIXTURE_LOG: logFile,
    FIXTURE_ROUTES: routeFile, FIXTURE_REAL_TOOLS: JSON.stringify(realTools), FAIL_TOOL: '',
  }
  return {
    root, home, tools, temp, env, asset, digest, archive, checksumFile, apiFile,
    install(args = [], overrides = {}) {
      return spawnSync('/bin/sh', [installer, ...args], { cwd: home, env: { ...env, ...overrides }, encoding: 'utf8', timeout: 20_000 })
    },
    calls() {
      return existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []
    },
    checksums(text) { writeFileSync(checksumFile, text) },
  }
}

function passed(result) {
  assert.equal(result.error, undefined)
  assert.equal(result.status, 0, result.stderr)
}

function existingBinary(f, dest = join(f.home, '.local/bin')) {
  mkdirSync(dest, { recursive: true })
  const binary = join(dest, 'git-ticket-canvas')
  writeFileSync(binary, 'keep this binary', { mode: 0o755 })
  const inode = statSync(binary).ino
  return {
    binary, dest, inode,
    preserved() {
      assert.equal(readFileSync(binary, 'utf8'), 'keep this binary')
      assert.equal(statSync(binary).ino, inode)
      assert.deepEqual(readdirSync(dest), ['git-ticket-canvas'])
      assert.deepEqual(readdirSync(f.temp), [])
    },
  }
}

for (const [os, arch, suffix] of [
  ['Linux', 'x86_64', 'linux_amd64'], ['Linux', 'aarch64', 'linux_arm64'],
  ['Darwin', 'x86_64', 'darwin_amd64'], ['Darwin', 'arm64', 'darwin_arm64'],
  ['Linux', 'amd64', 'linux_amd64'], ['Linux', 'arm64', 'linux_arm64'],
]) {
  test(`latest stable selects ${suffix} for ${os}/${arch} and replaces atomically`, t => {
    const f = fixture(t, { os, arch }), old = existingBinary(f)
    const result = f.install([], { PATH: `${old.dest}:${f.tools}` })
    passed(result)
    assert.equal(readFileSync(old.binary, 'utf8'), binaryContents)
    assert.notEqual(statSync(old.binary).ino, old.inode)
    assert.equal(statSync(old.binary).mode & 0o777, 0o755)
    assert.deepEqual(readdirSync(old.dest), ['git-ticket-canvas'])
    assert.deepEqual(readdirSync(f.temp), [])
    assert.doesNotMatch(result.stderr, /warning/)
    const calls = f.calls(), urls = calls.filter(call => call.tool === 'curl').map(call => call.args[3])
    assert.deepEqual(urls, [latestURL,
      `https://github.com/${repository}/releases/download/v1.2.3/git-ticket-canvas_1.2.3_${suffix}.tar.gz`,
      `https://github.com/${repository}/releases/download/v1.2.3/checksums.txt`])
    const rename = calls.find(call => call.tool === 'mv')
    assert.ok(rename.args[1].startsWith(join(old.dest, '.git-ticket-canvas.new.')))
    assert.equal(rename.args[2], old.binary)
    assert.match(result.stdout, /sha256 verified/)
  })
}

test('an exact version bypasses latest and installs directly into a prefix with spaces', t => {
  const f = fixture(t, { tag: 'v2.4.1-rc.1' }), dest = join(f.home, 'chosen bin')
  passed(f.install(['--version', 'v2.4.1-rc.1', '--prefix', dest]))
  assert.equal(readFileSync(join(dest, 'git-ticket-canvas'), 'utf8'), binaryContents)
  assert.equal(existsSync(join(dest, 'bin')), false)
  assert.equal(existsSync(join(f.home, '.local')), false)
  assert.equal(f.calls().filter(call => call.tool === 'curl').length, 2)
  assert.equal(f.calls().some(call => call.args.includes(latestURL)), false)
})

test('accepts a tag without v and a relative prefix', t => {
  const f = fixture(t, { tag: '1.2.3' })
  passed(f.install(['--version', '1.2.3', '--prefix', 'relative bin']))
  assert.ok(existsSync(join(f.home, 'relative bin/git-ticket-canvas')))
})

test('falls back to ~/bin and warns when it is absent from PATH', t => {
  const f = fixture(t)
  writeFileSync(join(f.home, '.local'), 'blocked')
  const result = f.install()
  passed(result)
  assert.ok(existsSync(join(f.home, 'bin/git-ticket-canvas')))
  assert.match(result.stderr, /not on PATH/)
})

test('warns about a shadowing binary without touching it', t => {
  const f = fixture(t), first = join(f.home, 'first bin'), dest = join(f.home, 'chosen bin')
  mkdirSync(first)
  const other = join(first, 'git-ticket-canvas')
  writeFileSync(other, 'other binary', { mode: 0o755 })
  const result = f.install(['--prefix', dest], { PATH: `${first}:${dest}:${f.tools}` })
  passed(result)
  assert.match(result.stderr, /comes first on PATH/)
  assert.doesNotMatch(result.stderr, /not on PATH/)
  assert.equal(readFileSync(other, 'utf8'), 'other binary')
})

const invalidChecksums = {
  'mismatched digest': f => `${'0'.repeat(64)}  ${f.asset}\n`,
  'missing entry': () => '',
  'malformed digest': f => `not-a-sha256  ${f.asset}\n`,
  'non-hex digest': f => `${'g'.repeat(64)}  ${f.asset}\n`,
  'duplicate entry': f => `${f.digest}  ${f.asset}\n${f.digest}  ${f.asset}\n`,
  'extra fields': f => `${f.digest} unexpected ${f.asset}\n`,
  'filename suffix only': f => `${f.digest}  prefix-${f.asset}\n`,
  'regex lookalike filename': f => `${f.digest}  ${f.asset.replaceAll('.', 'X')}\n`,
}
for (const [name, contents] of Object.entries(invalidChecksums)) {
  test(`${name} fails before tar and preserves the installed binary`, t => {
    const f = fixture(t), old = existingBinary(f)
    f.checksums(contents(f))
    const result = f.install()
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /checksum entry|sha256 verification failed/)
    assert.equal(f.calls().some(call => call.tool === 'tar'), false)
    old.preserved()
  })
}

test('detects archive corruption despite a well-formed checksum entry', t => {
  const f = fixture(t), old = existingBinary(f)
  writeFileSync(f.archive, 'corrupted download')
  const result = f.install()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /sha256 verification failed/)
  assert.equal(f.calls().some(call => call.tool === 'tar'), false)
  old.preserved()
})

test('shasum fallback verifies uppercase hashes and binary-mode entries', { skip: !locate('shasum') }, t => {
  const f = fixture(t, { hash: 'shasum', member: './git-ticket-canvas' })
  f.checksums(`${f.digest.toUpperCase()} *${f.asset}\n`)
  passed(f.install())
  assert.ok(existsSync(join(f.home, '.local/bin/git-ticket-canvas')))
})

test('refuses to download when neither SHA256 tool is available', t => {
  const f = fixture(t, { hash: 'none' })
  const result = f.install()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /neither sha256sum nor shasum/)
  assert.equal(f.calls().some(call => call.tool === 'curl'), false)
})

for (const missing of ['archive', 'checksumFile', 'apiFile']) {
  test(`unavailable ${missing} fails without replacing the installed binary`, t => {
    const f = fixture(t), old = existingBinary(f)
    rmSync(f[missing])
    const result = f.install()
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /could not fetch|downloading .* failed/)
    assert.equal(f.calls().some(call => call.tool === 'tar'), false)
    old.preserved()
  })
}

for (const response of ['{}', '{"tag_name":"../../escape"}', 'not JSON']) {
  test(`rejects unusable latest metadata ${response}`, t => {
    const f = fixture(t)
    writeFileSync(f.apiFile, response)
    const result = f.install()
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /invalid release tag/)
    assert.equal(f.calls().filter(call => call.tool === 'curl').length, 1)
    assert.deepEqual(readdirSync(f.temp), [])
  })
}

for (const [name, options] of [['missing binary', { member: 'README.md' }], ['symlink binary', { symlink: true }]]) {
  test(`rejects an archive with a ${name}`, t => {
    const f = fixture(t, options), old = existingBinary(f)
    const result = f.install()
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /archive.*binary/)
    old.preserved()
  })
}

for (const tool of ['tar', 'cp', 'chmod', 'mv']) {
  test(`${tool} failure preserves the old binary and removes staging files`, t => {
    const f = fixture(t), old = existingBinary(f)
    assert.notEqual(f.install([], { FAIL_TOOL: tool }).status, 0)
    old.preserved()
  })
}

test('refuses blocked default and explicit destinations', t => {
  const f = fixture(t)
  writeFileSync(join(f.home, '.local'), 'blocked')
  writeFileSync(join(f.home, 'bin'), 'blocked')
  const result = f.install()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /neither .* is writable/)
  const explicit = f.install(['--prefix', join(f.home, 'bin')])
  assert.notEqual(explicit.status, 0)
  assert.match(explicit.stderr, /cannot create/)
  assert.deepEqual(readdirSync(f.temp), [])
})

test('refuses an existing directory at the binary path', t => {
  const f = fixture(t), dest = join(f.home, '.local/bin')
  mkdirSync(join(dest, 'git-ticket-canvas'), { recursive: true })
  const result = f.install()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /is a directory/)
  assert.deepEqual(readdirSync(join(dest, 'git-ticket-canvas')), [])
  assert.deepEqual(readdirSync(f.temp), [])
})

test('help needs no tools and performs no downloads', t => {
  const f = fixture(t)
  for (const flag of ['--help', '-h']) {
    const result = f.install([flag], { PATH: '/nonexistent-canvas-tools' })
    passed(result)
    assert.match(result.stdout, /--prefix DIR/)
    assert.match(result.stdout, /--version TAG/)
    assert.match(result.stdout, /latest stable/)
  }
  assert.deepEqual(f.calls(), [])
})

for (const args of [['--prefix'], ['--prefix', ''], ['--prefix', '--version'], ['--version'], ['--unknown'], ['--version', '../../escape']]) {
  test(`rejects invalid arguments ${JSON.stringify(args)} without downloading`, t => {
    const f = fixture(t)
    assert.notEqual(f.install(args).status, 0)
    assert.equal(f.calls().some(call => call.tool === 'curl'), false)
    assert.deepEqual(readdirSync(f.temp), [])
  })
}

for (const platform of [{ os: 'FreeBSD' }, { arch: 'riscv64' }]) {
  test(`rejects unsupported platform ${JSON.stringify(platform)} before downloading`, t => {
    const f = fixture(t, platform)
    const result = f.install()
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /unsupported/)
    assert.equal(f.calls().some(call => call.tool === 'curl'), false)
  })
}

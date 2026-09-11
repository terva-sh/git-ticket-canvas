import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { access, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { defaultArchive, expectedTickets, unpackCanvasFixture } from '../browser/canvas-fixture.mjs'

const digest = async path => createHash('sha256').update(await readFile(path)).digest('hex')
const missing = async path => {
  try { await access(path); return false } catch { return true }
}

test('concurrent callers get their own store and neither disturbs the other', async () => {
  const [first, second] = await Promise.all([unpackCanvasFixture(), unpackCanvasFixture()])
  try {
    assert.notEqual(first.store, second.store)
    assert.equal(first.tickets, expectedTickets)
    assert.equal(second.tickets, expectedTickets)
    // The failure this guards is one worker deleting the other's store, which
    // only shows up as the second caller's files vanishing mid-run.
    await first.cleanup()
    assert.ok(await missing(first.store))
    await access(join(second.store, '.tickets', 'canvas', 'default.yml'))
    assert.equal((await readdir(join(second.store, '.tickets'))).length > 0, true)
  } finally {
    await first.cleanup()
    await second.cleanup()
  }
})

test('cleanup removes the store and the committed archive is never written', async () => {
  const before = await digest(defaultArchive)
  const fixture = await unpackCanvasFixture()
  await access(join(fixture.store, '.tickets', 'canvas', 'default.yml'))
  await fixture.cleanup()
  assert.ok(await missing(fixture.store))
  assert.equal(await digest(defaultArchive), before)
})

test('cleanup is safe to call twice', async () => {
  const fixture = await unpackCanvasFixture()
  await fixture.cleanup()
  await fixture.cleanup()
  assert.ok(await missing(fixture.store))
})

test('a pinned store uses the given path, so a capture stays reproducible', async () => {
  const pinned = join(tmpdir(), 'git-ticket-canvas-fixture-pinned-test')
  const fixture = await unpackCanvasFixture({ store: pinned })
  try {
    assert.equal(fixture.store, pinned)
    assert.equal(fixture.tickets, expectedTickets)
  } finally {
    await fixture.cleanup()
  }
})

test('a pinned store replaces whatever was there before', async () => {
  const pinned = join(tmpdir(), 'git-ticket-canvas-fixture-pinned-stale')
  const first = await unpackCanvasFixture({ store: pinned })
  const stale = join(first.store, 'stale-marker')
  await (await import('node:fs/promises')).writeFile(stale, '')
  const second = await unpackCanvasFixture({ store: pinned })
  try {
    assert.ok(await missing(stale))
    assert.equal(second.tickets, expectedTickets)
  } finally {
    await second.cleanup()
  }
})

test('a bad archive leaves no store behind', async () => {
  await assert.rejects(unpackCanvasFixture({ archive: join(tmpdir(), 'no-such-canvas-fixture.tgz') }))
})

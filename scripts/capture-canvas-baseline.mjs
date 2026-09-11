#!/usr/bin/env node
import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { unpackCanvasFixture } from '../tests/browser/canvas-fixture.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultFixture = 'docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/ahpsh-tickets.tgz'
const defaultOutput = 'docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/canvas-baseline.png'
const referenceTicket = 'TKT-01M24GA0PMGWEM80RBS502FGVY'

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index < 0 ? fallback : process.argv[index + 1] || fallback
}

function pathFrom(value) {
  return isAbsolute(value) ? value : resolve(repo, value)
}

const fixture = pathFrom(argument('--fixture', defaultFixture))
const output = pathFrom(argument('--output', defaultOutput))
const metadataPath = pathFrom(argument('--metadata', output.replace(/\.png$/i, '.json')))
const selectedTicket = argument('--select', referenceTicket)
const storePath = pathFrom(argument('--store', process.env.CANVAS_CAPTURE_STORE || join(tmpdir(), 'git-ticket-canvas-reference-store-2026-09-11-warricksothr-arkham-halloween-photo-scavenger-hunt')))
const relationshipMode = argument('--relationships', 'all')
const width = Number(argument('--width', '2048'))
const height = Number(argument('--height', '1152'))

if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
  throw new Error('viewport width and height must be positive integers')
}

async function stop(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  await new Promise(resolveStop => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 5_000)
    child.once('exit', () => { clearTimeout(timer); resolveStop() })
    child.kill('SIGTERM')
  })
}

async function startServer(store, binary) {
  const args = ['-store', store, '-addr', '127.0.0.1:0', '-actor', 'agent:playwright/baseline']
  const child = spawn(binary, args, {
    cwd: repo,
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  const url = await new Promise((resolveURL, reject) => {
    let log = ''
    const timer = setTimeout(() => finish(new Error(`server startup timeout: ${log}`)), 30_000)
    const finish = (error, value) => {
      clearTimeout(timer)
      child.removeListener('error', onError)
      child.removeListener('exit', onExit)
      child.stderr?.removeListener('data', onData)
      if (error) reject(error)
      else resolveURL(value)
    }
    const onError = error => finish(error)
    const onExit = code => finish(new Error(`server exited ${code}: ${log}`))
    const onData = data => {
      log += data.toString()
      const match = log.match(/canvas (http:\/\/127\.0\.0\.1:\d+)/)
      if (match) finish(null, match[1])
    }
    child.on('error', onError)
    child.on('exit', onExit)
    child.stderr?.on('data', onData)
  })
  if (process.env.CANVAS_CAPTURE_DEBUG) {
    child.stderr?.on('data', data => process.stderr.write(data))
  } else {
    child.stderr?.resume()
  }
  return { child, url }
}

async function pageReady(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  const boardResponse = await page.request.get(`${url}/api/board?board=default`)
  if (!boardResponse.ok()) throw new Error(`board request failed ${boardResponse.status()}: ${await boardResponse.text()}`)
  const board = await boardResponse.json()
  console.log(`fixture board tickets=${board.tickets?.length || 0} cards=${Object.keys(board.layout?.cards || {}).length}`)
  await page.locator('#relationshipMode').selectOption(relationshipMode)
  await page.locator('#cards').waitFor({ state: 'attached' })
  const cardCount = await page.locator('#cards .card').count()
  console.log(`dom cards=${cardCount}`)
  if (cardCount !== 30) {
    console.log((await page.locator('#cards').evaluate(element => element.outerHTML)).slice(0, 3000))
    throw new Error(`expected 30 cards, found ${cardCount}`)
  }
  await page.locator('#cards .card').first().evaluateAll(cards => {
    if (cards.some(card => {
      const bounds = card.getBoundingClientRect()
      return bounds.width <= 0 || bounds.height <= 0
    })) throw new Error('one or more cards have no measured bounds')
  })
  const selected = page.locator(`.card[data-id="${selectedTicket}"]`)
  await selected.click()
  await page.locator('#inspector.open').waitFor({ state: 'visible' })
  await page.locator('#edges .relationship').first().waitFor({ state: 'attached' })
}

// The toolbar renders the build version, which carries the commit SHA on a
// git-described build, so the image would change on every commit.
//
// Serve a constant version to the page rather than rewriting the DOM after it
// renders. The toolbar re-renders on selection, live updates, and every store
// publication, and each of those restores whatever the app actually fetched.
// Measured: rewriting textContent left two builds differing at dd482d9a and
// 68685d99, while the same build twice agreed, so the real value came back
// before the screenshot.
const stubbedVersion = {
  schemaVersion: 1, kind: 'version', version: 'baseline',
  commit: 'baseline', go: 'baseline', modified: false,
}
const expectedVersionLabel = 'baseline'
// The brand prints the store path. The fixture now unpacks into a per-run
// directory so two callers cannot collide, which would otherwise repaint the
// brand on every capture, and `tmpdir()` already differed across platforms.
// Both go away by serving one path to the page.
const stubbedStorePath = '/canvas-fixture/.tickets'

async function stubBuildIdentity(page) {
  await page.route('**/api/version', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(stubbedVersion),
  }))
  await page.route('**/api/board*', async route => {
    const response = await route.fetch()
    // A conditional read answers 304 with no body to rewrite.
    if (response.status() !== 200) { await route.fulfill({ response }); return }
    await route.fulfill({ response, json: { ...await response.json(), storePath: stubbedStorePath } })
  })
}

// Assert what the toolbar ended up showing. A stub that stops matching, or a
// new element carrying build identity, then fails the capture instead of
// quietly producing a baseline that nobody can reproduce.
async function assertStableChrome(page) {
  const seen = await page.evaluate(() => ({
    version: document.querySelector('#version > summary')?.textContent ?? null,
    storePath: document.querySelector('#storePath')?.textContent ?? null,
  }))
  for (const [field, expected] of [['version', expectedVersionLabel], ['storePath', stubbedStorePath]]) {
    if (seen[field] !== expected) {
      throw new Error(`toolbar ${field} reads ${JSON.stringify(seen[field])}, expected `
        + `${JSON.stringify(expected)}. That would vary the baseline between runs.`)
    }
  }
  return seen
}

async function main() {
  const fixtureBytes = await readFile(fixture)
  const fixtureChecksum = createHash('sha256').update(fixtureBytes).digest('hex')
  // Pin the store for a capture. The helper would otherwise pick a fresh
  // directory per run, which is what a parallel test suite wants and what a
  // reproducible artifact does not.
  const fixtureStore = await unpackCanvasFixture({ archive: fixture, store: storePath })
  const temporary = fixtureStore.store
  let server
  let browser
  try {
    const binary = process.env.GIT_TICKET_CANVAS_BINARY
      ? pathFrom(process.env.GIT_TICKET_CANVAS_BINARY)
      : join(temporary, 'git-ticket-canvas')
    if (!process.env.GIT_TICKET_CANVAS_BINARY) {
      execFileSync('go', ['build', '-o', binary, '.'], { cwd: repo, stdio: 'inherit' })
    }
    server = await startServer(temporary, binary)
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    })
    const context = await browser.newContext({
      viewport: { width, height }, deviceScaleFactor: 1, colorScheme: 'dark',
    })
    const page = await context.newPage()
    await stubBuildIdentity(page)
    await pageReady(page, server.url)
    const chrome = await assertStableChrome(page)
    const board = await page.evaluate(async () => (await fetch('/api/board?board=default')).json())
    const version = await page.evaluate(async () => (await fetch('/api/version')).json())
    await mkdir(dirname(output), { recursive: true })
    // Selecting a card starts two CSS transitions: the inspector slides in over
    // .16s and the selected card's handle fades in over .12s. Waiting for
    // `#inspector.open` to be visible does not wait for either to finish, so
    // the shot could land mid-transition. Measured: six identical runs gave
    // three different PNGs while card geometry was byte-identical in all six,
    // which is how this was tracked to paint rather than layout. `animations:
    // 'disabled'` finishes finite transitions at their end state first.
    await page.screenshot({ path: output, fullPage: false, animations: 'disabled', caret: 'hide' })
    const metadata = {
      schema: 1,
      fixture: {
        archive: 'docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/ahpsh-tickets.tgz',
        sha256: fixtureChecksum,
        ticketCount: board.tickets.length,
      },
      viewport: { width, height, deviceScaleFactor: 1 },
      board: await page.locator('#boardSelect').inputValue(),
      relationships: await page.locator('#relationshipMode').inputValue(),
      selectedTicket,
      cards: await page.locator('#cards .card').count(),
      relationshipsRendered: await page.locator('#edges .relationship').count(),
      // Where every card landed. A baseline that drifts then says which cards
      // moved, instead of only that the bytes changed.
      geometry: await page.evaluate(() => [...document.querySelectorAll('#cards .card')]
        .map(card => {
          const box = card.getBoundingClientRect()
          return [card.dataset.id, Math.round(box.x), Math.round(box.y),
            Math.round(box.width), Math.round(box.height)]
        })
        .sort((a, b) => a[0].localeCompare(b[0]))),
      // The build that produced the image, for provenance. It varies per build
      // and is deliberately not what the page rendered.
      appVersion: version,
      // What the toolbar actually showed. Held constant so the PNG can be
      // compared byte for byte across builds.
      renderedChrome: chrome,
      output: 'canvas-baseline.png',
    }
    await mkdir(dirname(metadataPath), { recursive: true })
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
    await context.close()
    console.log(JSON.stringify({ output, metadata: metadataPath, ...metadata }, null, 2))
  } finally {
    await browser?.close()
    await stop(server?.child)
    await fixtureStore.cleanup()
  }
}

await main()

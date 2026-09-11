#!/usr/bin/env node
import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { unpackCanvasFixture } from '../tests/browser/canvas-fixture.mjs'
import {
  SCENE, SHOT, assertStableChrome, cardGeometry, loadScene, selectReference, stubBuildIdentity,
} from '../tests/browser/canvas-scene.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultFixture = 'docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/ahpsh-tickets.tgz'
const defaultOutput = 'docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/canvas-baseline.png'

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
const selectedTicket = argument('--select', SCENE.selectedTicket)
const storePath = pathFrom(argument('--store', process.env.CANVAS_CAPTURE_STORE || join(tmpdir(), 'git-ticket-canvas-reference-store-2026-09-11-warricksothr-arkham-halloween-photo-scavenger-hunt')))
const relationshipMode = argument('--relationships', SCENE.relationshipMode)
const width = Number(argument('--width', String(SCENE.viewport.width)))
const height = Number(argument('--height', String(SCENE.viewport.height)))

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

// The scene itself, the identity stubs and the screenshot options live in
// `tests/browser/canvas-scene.mjs`, so this artifact and the visual suite in
// `canvas-density.spec.ts` cannot drift into describing different pictures.
async function pageReady(page, url) {
  const scene = await loadScene(page, url, { relationshipMode })
  const { board, cardCount } = scene
  console.log(`fixture board tickets=${board.tickets?.length || 0} cards=${Object.keys(board.layout?.cards || {}).length}`)
  console.log(`dom cards=${cardCount}`)
  if (cardCount !== SCENE.expectedCards) {
    console.log((await page.locator('#cards').evaluate(element => element.outerHTML)).slice(0, 3000))
    throw new Error(`expected ${SCENE.expectedCards} cards, found ${cardCount}`)
  }
  await selectReference(page, { selectedTicket })
  return scene
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
    // SHOT carries `animations: 'disabled'` and `caret: 'hide'`, and the module
    // records why. The short version: selecting a card starts transitions that
    // no wait in `loadScene` waits for.
    await page.screenshot({ path: output, fullPage: false, ...SHOT })
    const metadata = {
      schema: 1,
      // The bytes this metadata describes. `tests/tooling/canvas-baseline.test.mjs`
      // checks the image against this value, so a baseline rewritten by
      // `playwright --update-snapshots`, which cannot update this file, fails a
      // check instead of landing with metadata describing the previous image.
      pngSha256: createHash('sha256').update(await readFile(output)).digest('hex'),
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
      geometry: await cardGeometry(page),
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

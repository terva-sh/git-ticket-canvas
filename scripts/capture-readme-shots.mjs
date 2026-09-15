#!/usr/bin/env node
// Capture the README images from a tarballed ticket store.
//
// The seed is an archive rather than a directory, so the pictures in the README
// describe a fixed, committed store and not whatever the machine running this
// happened to have open. Pass --fixture to shoot a different bundle; nothing
// here knows anything about the default one except its path.
//
// Reproducibility is the whole point, so everything that varies per build or per
// machine is held constant and the capture fails rather than emitting an image
// when it cannot be. Version, commit and store path come from the stubs in
// `tests/browser/canvas-scene.mjs`, which the review baseline already uses, so
// the two captures cannot drift into stubbing different things.
//
// Not a CI gate. `docs/canvas-baseline.md` records that a runner renders text
// with Alpine Chromium and font-noto while a developer machine uses Playwright's
// Chromium, and that the two disagree. Byte-comparing these images on a runner
// would fail for a reason that is not a defect.
import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { unpackCanvasFixture } from '../tests/browser/canvas-fixture.mjs'
import { SCENE, SHOT, assertStableChrome, loadScene, stubBuildIdentity } from '../tests/browser/canvas-scene.mjs'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaults = {
  fixture: 'docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/ahpsh-tickets.tgz',
  out: 'docs/images',
  // 16:9 at a full screen. Wide enough that the inspector and the board are
  // both legible when GitHub scales the image down to its column.
  width: 1920,
  height: 1080,
}

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index < 0 ? fallback : process.argv[index + 1] ?? fallback
}

const pathFrom = value => (isAbsolute(value) ? value : resolve(repo, value))

const fixture = pathFrom(argument('--fixture', defaults.fixture))
const out = pathFrom(argument('--out', defaults.out))
const width = Number(argument('--width', String(defaults.width)))
const height = Number(argument('--height', String(defaults.height)))
const selected = argument('--select', SCENE.selectedTicket)

if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
  throw new Error('viewport width and height must be positive integers')
}

// Pinned rather than mkdtemp. The store browser prints each store's path, so a
// random directory would put a different string in the image on every run.
const workspace = join(tmpdir(), 'git-ticket-canvas-readme-shots')

// Two stores from one seed. The browser shot is about the store list, not about
// differing ticket data, so copying the seed is honest and keeps the generator
// to a single input. The third path is deliberately absent: a store that cannot
// be opened is listed with its reason rather than hidden, and that is worth
// showing because it is the design decision, not a rendering accident.
const stores = [
  { dir: join(workspace, 'arkham-photo-hunt'), seeded: true },
  { dir: join(workspace, 'halloween-archive'), seeded: true },
  { dir: join(workspace, 'moved-last-week'), seeded: false },
]

async function stop(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return
  await new Promise(done => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 5_000)
    child.once('exit', () => { clearTimeout(timer); done() })
    child.kill('SIGTERM')
  })
}

async function startServer(binary) {
  const child = spawn(binary, [
    ...stores.flatMap(store => ['-store', store.dir]),
    '-addr', '127.0.0.1:0', '-actor', 'agent:playwright/readme',
  ], {
    cwd: repo,
    // A capture must not read or write the running person's favorites, and the
    // canvas records them outside every repository.
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
      XDG_STATE_HOME: join(workspace, 'state'),
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  const url = await new Promise((done, fail) => {
    let log = ''
    const timer = setTimeout(() => finish(new Error(`server startup timeout: ${log}`)), 30_000)
    const finish = (error, value) => {
      clearTimeout(timer)
      child.stderr?.removeAllListeners('data')
      if (error) fail(error)
      else done(value)
    }
    child.once('error', finish)
    child.once('exit', code => finish(new Error(`server exited ${code}: ${log}`)))
    child.stderr?.on('data', data => {
      log += data.toString()
      const match = log.match(/canvas (http:\/\/127\.0\.0\.1:\d+)/)
      if (match) finish(null, match[1])
    })
  })
  child.stderr?.resume()
  return { child, url }
}

/**
 * Wait until the canvas transform stops changing.
 *
 * Fit animates toward its target with requestAnimationFrame, and SHOT's
 * `animations: 'disabled'` governs CSS animations rather than a JavaScript
 * loop. Screenshotting without this lands mid-flight, which is the same class
 * of bug the baseline capture found when six identical runs produced three
 * different images.
 */
async function settled(page) {
  await page.waitForFunction(() => {
    const scene = document.querySelector('#scene')
    if (!scene) return false
    const now = getComputedStyle(scene).transform
    const previous = window.__readmeShotTransform
    window.__readmeShotTransform = now
    return previous === now
  }, null, { timeout: 15_000, polling: 100 })
}

async function shoot(page, name, notes) {
  const file = join(out, `${name}.png`)
  await page.screenshot({ path: file, fullPage: false, ...SHOT })
  const bytes = await readFile(file)
  console.log(`  ${name}.png  ${(bytes.length / 1024).toFixed(0)} KiB  ${notes}`)
  return { name, file: `${out.slice(repo.length + 1)}/${name}.png`, sha256: createHash('sha256').update(bytes).digest('hex'), notes }
}

async function main() {
  const seed = await readFile(fixture)
  const seedChecksum = createHash('sha256').update(seed).digest('hex')
  await rm(workspace, { recursive: true, force: true })
  let server
  let browser
  const captured = []
  try {
    for (const store of stores.filter(s => s.seeded)) {
      await unpackCanvasFixture({ archive: fixture, store: store.dir })
    }
    const binary = process.env.GIT_TICKET_CANVAS_BINARY
      ? pathFrom(process.env.GIT_TICKET_CANVAS_BINARY)
      : join(workspace, 'git-ticket-canvas')
    if (!process.env.GIT_TICKET_CANVAS_BINARY) {
      execFileSync('go', ['build', '-o', binary, '.'], { cwd: repo, stdio: 'inherit' })
    }
    server = await startServer(binary)
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    })
    const context = await browser.newContext({
      viewport: { width, height }, deviceScaleFactor: 1, colorScheme: 'dark',
    })
    const page = await context.newPage()
    await stubBuildIdentity(page)
    // Store ids are a hash of the resolved path, so the script cannot know one
    // ahead of time and must not hardcode one. Ask the canvas which stores it
    // is serving and open the first seeded directory by the id it reports.
    const listed = await (await page.request.get(`${server.url}/api/stores`)).json()
    const at = directory => {
      const found = listed.stores.find(store => store.path.startsWith(directory))
      if (found) return found
      throw new Error(`no store at ${directory}; canvas listed `
        + listed.stores.map(store => `${store.display} (${store.path})`).join(', '))
    }
    const primary = at(stores[0].dir)
    // The picker's quick list is the current store plus recent and favorite
    // ones, so a canvas that has only ever opened one store shows a menu of
    // one. Marking the second a favorite is what a person would have done by
    // the time they had two, and it puts the star in the picture as well. The
    // state directory is inside the workspace and the workspace is removed at
    // the start of every run, so this does not accumulate.
    const favorite = at(stores[1].dir)
    const marked = await page.request.put(`${server.url}/api/favorites`, {
      data: { store: favorite.name, favorite: true },
    })
    if (!marked.ok()) {
      throw new Error(`marking ${favorite.display} a favorite failed ${marked.status()}`)
    }
    const scene = await loadScene(page, server.url, {
      relationshipMode: SCENE.relationshipMode, store: primary.name,
    })
    if (scene.cardCount !== SCENE.expectedCards) {
      throw new Error(`expected ${SCENE.expectedCards} cards, found ${scene.cardCount}`)
    }
    // Fails the capture rather than producing an image with this build's commit
    // baked into the toolbar, which nobody could reproduce.
    const chrome = await assertStableChrome(page)
    await mkdir(out, { recursive: true })

    await page.locator('#btnFit').click()
    await settled(page)
    captured.push(await shoot(page, 'canvas', 'the board fitted, dependency and parent edges drawn'))

    await page.locator(`.card[data-id="${selected}"]`).click()
    await page.locator('#inspector.open').waitFor({ state: 'visible' })
    await page.locator('#edges .relationship').first().waitFor({ state: 'attached' })
    await settled(page)
    captured.push(await shoot(page, 'inspector', 'one ticket selected, every field on the right'))

    // The picker rather than the full browser. `#storeBrowser` is a full-screen
    // view, so at three stores it is three rows above nine tenths of empty
    // panel: an honest picture of the component and a poor picture of the
    // product. The dropdown shows the same store list over the board it belongs
    // to, which is what a reader needs to understand at a glance.
    await page.keyboard.press('Escape')
    await page.locator('#inspector.open').waitFor({ state: 'hidden' })
    await page.locator('#storePickerLabel').click()
    await page.locator('#storePicker[open] .store-quick-item').first().waitFor({ state: 'visible' })
    await settled(page)
    captured.push(await shoot(page, 'stores', 'the store picker open over the board, one store per row'))

    const version = await page.evaluate(async () => (await fetch('/api/version')).json())
    await writeFile(join(out, 'shots.json'), `${JSON.stringify({
      schema: 1,
      // Regenerate with `just readme-shots`. These hashes describe the bytes in
      // the repository at the commit that wrote this file; they are recorded for
      // provenance and are deliberately not checked on CI, because a runner and
      // a developer machine render text differently.
      generator: 'scripts/capture-readme-shots.mjs',
      seed: { archive: argument('--fixture', defaults.fixture), sha256: seedChecksum },
      viewport: { width, height, deviceScaleFactor: 1, colorScheme: 'dark' },
      stores: stores.map(store => ({ directory: store.dir.slice(workspace.length + 1), seeded: store.seeded })),
      openedStore: { id: primary.name, display: primary.display },
      favoriteStore: { id: favorite.name, display: favorite.display },
      cards: scene.cardCount,
      relationships: await page.locator('#edges .relationship').count(),
      selectedTicket: selected,
      renderedChrome: chrome,
      appVersion: version,
      images: captured,
    }, null, 2)}\n`)
    await context.close()
    console.log(`\nwrote ${captured.length} images and shots.json to ${out.slice(repo.length + 1)}`)
  } finally {
    await browser?.close()
    await stop(server?.child)
    await rm(workspace, { recursive: true, force: true })
  }
}

await main()

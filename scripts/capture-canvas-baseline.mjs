#!/usr/bin/env node
import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { access, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
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

async function adaptLayout(root) {
  const path = join(root, '.tickets', 'canvas', 'default.yml')
  const source = await readFile(path, 'utf8')
  const removedFields = ['pens', 'ruleOrder', 'inbox']
  const data = source.split('\n')
    .map(line => line === 'schema: 3' ? 'schema: 2' : line)
    .filter(line => !removedFields.some(field => line.startsWith(`${field}:`)))
    .join('\n')
  await writeFile(path, data)
  return { sourceSchema: 3, targetSchema: 2, removedFields }
}

async function ensureReferenceTargets(root) {
  const pending = [join(root, '.tickets')]
  while (pending.length) {
    const directory = pending.pop()
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        pending.push(path)
        continue
      }
      if (!entry.name.endsWith('.md')) continue
      const text = await readFile(path, 'utf8')
      for (const match of text.matchAll(/^\s+path:\s+(.+)$/gm)) {
        const value = match[1].trim().replace(/^['"]|['"]$/g, '')
        const target = resolve(root, value)
        if (!value || value === 'null' || !target.startsWith(`${root}/`)) continue
        await mkdir(dirname(target), { recursive: true })
        try { await access(target) } catch { await writeFile(target, '') }
      }
    }
  }
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

async function main() {
  const fixtureBytes = await readFile(fixture)
  const fixtureChecksum = createHash('sha256').update(fixtureBytes).digest('hex')
  const temporary = storePath
  await rm(temporary, { recursive: true, force: true })
  await mkdir(temporary, { recursive: true })
  let server
  let browser
  try {
    execFileSync('tar', ['-xzf', fixture, '-C', temporary])
    const layoutAdapter = await adaptLayout(temporary)
    // The archive contains the .tickets store, but not the original repository
    // files named by ticket references. Empty deterministic targets make the
    // copied fixture valid without changing the immutable source archive.
    await ensureReferenceTargets(temporary)
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
    await pageReady(page, server.url)
    const board = await page.evaluate(async () => (await fetch('/api/board?board=default')).json())
    const version = await page.evaluate(async () => (await fetch('/api/version')).json())
    await mkdir(dirname(output), { recursive: true })
    await page.screenshot({ path: output, fullPage: false })
    const metadata = {
      schema: 1,
      fixture: {
        archive: 'docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/ahpsh-tickets.tgz',
        sha256: fixtureChecksum,
        ticketCount: board.tickets.length,
        layoutAdapter,
      },
      viewport: { width, height, deviceScaleFactor: 1 },
      board: await page.locator('#boardSelect').inputValue(),
      relationships: await page.locator('#relationshipMode').inputValue(),
      selectedTicket,
      cards: await page.locator('#cards .card').count(),
      relationshipsRendered: await page.locator('#edges .relationship').count(),
      appVersion: version,
      output: 'canvas-baseline.png',
    }
    await mkdir(dirname(metadataPath), { recursive: true })
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
    await context.close()
    console.log(JSON.stringify({ output, metadata: metadataPath, ...metadata }, null, 2))
  } finally {
    await browser?.close()
    await stop(server?.child)
    await rm(temporary, { recursive: true, force: true })
  }
}

await main()

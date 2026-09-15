import { test as base, expect } from '@playwright/test'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join, relative } from 'node:path'
// @ts-expect-error one JavaScript module serves the specs and the capture script
import { unpackCanvasFixture } from './canvas-fixture.mjs'

async function stop(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 5_000)
    child.once('exit', () => { clearTimeout(timer); resolve() })
    child.kill('SIGTERM')
  })
}

// A state directory of its own. The canvas records favorites and the store it
// last showed, and a test run must not write those into the state directory of
// whoever is running it, nor read one run's favorites into the next.
const stateHome = mkdtempSync(join(tmpdir(), 'git-ticket-canvas-browser-state-'))
process.once('exit', () => { rmSync(stateHome, { recursive: true, force: true }) })

export function commandEnvironment() {
  return { ...process.env, PATH: process.env.GIT_TICKET_CANVAS_BROWSER_BIN + delimiter + process.env.PATH,
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', XDG_STATE_HOME: stateHome }
}

async function start(root: string, readOnly: boolean, viaGit = false, addr = '127.0.0.1:0') {
  return spawnCanvas(['-store', root, ...(readOnly ? ['-read-only'] : [])], root, viaGit, addr)
}

/** A canvas over whatever stores the caller names, which is what a multi-store
 *  run needs and what `start` is a single-store case of. */
async function spawnCanvas(args: string[], cwd: string, viaGit = false, addr = '127.0.0.1:0') {
  const child = spawn(viaGit ? 'git' : join(process.env.GIT_TICKET_CANVAS_BROWSER_BIN!, 'git-ticket-canvas'), [
    ...(viaGit ? ['ticket-canvas'] : []),
    ...args, '-addr', addr, '-actor', 'agent:playwright/baseline',
  ], { stdio: ['ignore', 'ignore', 'pipe'], env: commandEnvironment(), cwd })
  try {
    const url = await new Promise<string>((resolve, reject) => {
      let log = ''
      const timer = setTimeout(() => reject(new Error(`Server startup timeout: ${log}`)), 10_000)
      const finish = (error?: Error, url?: string) => {
        clearTimeout(timer)
        child.removeListener('error', onError)
        child.removeListener('exit', onExit)
        child.stderr!.removeListener('data', onData)
        if (error) reject(error)
        else resolve(url!)
      }
      const onError = (error: Error) => finish(error)
      const onExit = (code: number | null) => finish(new Error(`Server exited ${code}: ${log}`))
      const onData = (data: Buffer) => {
        log += data.toString()
        const match = log.match(/canvas (http:\/\/127\.0\.0\.1:\d+)/)
        if (match) finish(undefined, match[1])
      }
      child.on('error', onError)
      child.on('exit', onExit)
      child.stderr!.on('data', onData)
    })
    // Drain later log output even after startup listeners are removed.
    child.stderr!.resume()
    return { child, url }
  } catch (error) {
    await stop(child)
    throw error
  }
}

export interface Ticket {
  id: string
  title: string
  status: string
  revision: string
  dependencies: string[]
  body: { description: string }
}
interface Board {
  tickets: Ticket[]
  layout: { cards: Record<string, { x: number; y: number }> }
}
interface App {
  url: string
  root: string
  board(): Promise<Board>
  create(title: string, card?: { x: number; y: number }): Promise<Ticket>
  patch(ticket: Ticket, ops: object[]): Promise<Ticket>
  readOnlyURL(viaGit?: boolean): Promise<string>
  snapshot(): Promise<Record<string, string>>
  /** Stop the server, run whileDown, and start a new one on the same port. */
  restart(whileDown?: () => Promise<void>): Promise<void>
}

// Compare persisted files, not response timestamps or only what the UI displays.
async function snapshot(root: string, dir = root): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) Object.assign(result, await snapshot(root, path))
    else result[relative(root, path)] = (await readFile(path)).toString('base64')
  }
  return result
}

/** A server on the committed 30-ticket AHPSH fixture, for the dense scene. */
interface Dense {
  url: string
  root: string
}

/** One canvas over two isolated stores, plus a configured store that is not
 *  there. Switching between two real stores is what only a browser can check,
 *  and the missing one is here because the interesting failure is a picker that
 *  hides it. */
interface Pair {
  url: string
  stores: { name: string; root: string; title: string; label: string }[]
  missing: string
}

export const test = base.extend<{ app: App; dense: Dense; pair: Pair }>({
  app: async ({ request }, use) => {
    const root = await mkdtemp(join(tmpdir(), 'git-ticket-canvas-browser-store-'))
    const servers: ChildProcess[] = []
    try {
      execFileSync(join(process.env.GIT_TICKET_CANVAS_BROWSER_BIN!, 'init-store'), [root])
      const server = await start(root, false)
      servers.push(server.child)
      await use({
        root, url: server.url,
        async board() {
          const response = await request.get(`${server.url}/api/board`)
          expect(response.status()).toBe(200)
          return response.json()
        },
        async create(title, card) {
          const response = await request.post(`${server.url}/api/tickets`, { data: { title, card } })
          expect(response.status()).toBe(201)
          return (await response.json()).ticket
        },
        async patch(ticket, ops) {
          const response = await request.patch(`${server.url}/api/tickets/${ticket.id}`, {
            data: { ifRevision: ticket.revision, ops },
          })
          expect(response.status()).toBe(200)
          return (await response.json()).ticket
        },
        async readOnlyURL(viaGit = false) {
          const readonly = await start(root, true, viaGit)
          servers.push(readonly.child)
          return readonly.url
        },
        snapshot: () => snapshot(join(root, '.tickets')),
        async restart(whileDown) {
          await stop(server.child)
          if (whileDown) await whileDown()
          const next = await start(root, false, false, `127.0.0.1:${new URL(server.url).port}`)
          server.child = next.child
          servers.push(next.child)
        },
      })
    } finally {
      await Promise.all(servers.map(stop))
      await rm(root, { recursive: true, force: true })
    }
  },
  pair: async ({ request }, use) => {
    const parent = await mkdtemp(join(tmpdir(), 'git-ticket-canvas-browser-pair-'))
    const servers: ChildProcess[] = []
    const stores = [
      { name: 'first', root: join(parent, 'first'), title: 'Only in the first store', label: 'onlyfirst' },
      { name: 'second', root: join(parent, 'second'), title: 'Only in the second store', label: 'onlysecond' },
    ]
    const missing = 'gone'
    try {
      for (const store of stores) {
        execFileSync(join(process.env.GIT_TICKET_CANVAS_BROWSER_BIN!, 'init-store'), [store.root])
      }
      const server = await spawnCanvas([
        ...stores.flatMap(store => ['-store', `${store.name}=${store.root}`]),
        '-store', `${missing}=${join(parent, 'not-there')}`,
        // Favorites of its own, so one test's marks cannot reach another's.
        '-state', join(parent, 'state.json'),
      ], parent)
      servers.push(server.child)

      for (const store of stores) {
        const created = await request.post(`${server.url}/api/stores/${store.name}/tickets`, {
          data: { title: store.title, card: { x: 0, y: 0 } },
        })
        expect(created.status()).toBe(201)
        const ticket = (await created.json()).ticket
        const labelled = await request.patch(`${server.url}/api/stores/${store.name}/tickets/${ticket.id}`, {
          data: { ifRevision: ticket.revision, ops: [{ op: 'addLabel', label: store.label }] },
        })
        expect(labelled.status()).toBe(200)
      }
      await use({ url: server.url, stores, missing })
    } finally {
      await Promise.all(servers.map(stop))
      await rm(parent, { recursive: true, force: true })
    }
  },
  // The archive unpacks into a fresh directory per call, so the two workers
  // `playwright.config` sets cannot delete each other's store mid-run.
  dense: async ({}, use) => {
    const fixture = await unpackCanvasFixture()
    const servers: ChildProcess[] = []
    try {
      const server = await start(fixture.store, false)
      servers.push(server.child)
      await use({ url: server.url, root: fixture.store })
    } finally {
      await Promise.all(servers.map(stop))
      await fixture.cleanup()
    }
  },
})
export { expect }

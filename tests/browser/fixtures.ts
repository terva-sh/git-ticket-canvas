import { test as base, expect } from '@playwright/test'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join, relative } from 'node:path'

async function stop(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 5_000)
    child.once('exit', () => { clearTimeout(timer); resolve() })
    child.kill('SIGTERM')
  })
}

export function commandEnvironment() {
  return { ...process.env, PATH: process.env.GIT_TICKET_CANVAS_BROWSER_BIN + delimiter + process.env.PATH,
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' }
}

async function start(root: string, readOnly: boolean, viaGit = false) {
  const child = spawn(viaGit ? 'git' : join(process.env.GIT_TICKET_CANVAS_BROWSER_BIN!, 'git-ticket-canvas'), [
    ...(viaGit ? ['ticket-canvas'] : []),
    '-store', root, '-addr', '127.0.0.1:0', '-actor', 'agent:playwright/baseline',
    ...(readOnly ? ['-read-only'] : []),
  ], { stdio: ['ignore', 'ignore', 'pipe'], env: commandEnvironment(), cwd: root })
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

export const test = base.extend<{ app: App }>({
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
      })
    } finally {
      await Promise.all(servers.map(stop))
      await rm(root, { recursive: true, force: true })
    }
  },
})
export { expect }

import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export default async function setup() {
  const bin = await mkdtemp(join(tmpdir(), 'git-ticket-canvas-browser-bin-'))
  try {
    execFileSync('go', ['install', '.'], {
      cwd: resolve('.'), env: { ...process.env, GOBIN: bin }, stdio: 'inherit', timeout: 120_000,
    })
    execFileSync('go', ['build', '-o', join(bin, 'init-store'), './tests/browser/init-store'], {
      cwd: resolve('.'), stdio: 'inherit', timeout: 120_000,
    })
    process.env.GIT_TICKET_CANVAS_BROWSER_BIN = bin
  } catch (error) {
    await rm(bin, { recursive: true, force: true })
    throw error
  }
  return () => rm(bin, { recursive: true, force: true })
}

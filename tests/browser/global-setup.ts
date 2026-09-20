import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
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
    // The git-ticket CLI at the version go.mod names, so a spec can write the
    // same board from the desk side and compare bytes with what the browser
    // wrote. Installed as a module of its own: the canvas module does not
    // carry the CLI's dependencies, only the layout package's.
    const version = (await readFile('go.mod', 'utf8')).match(/^\s*github\.com\/terva-sh\/git-ticket (v\S+)/m)?.[1]
    if (!version) throw new Error('go.mod does not name a git-ticket version')
    execFileSync('go', ['install', `github.com/terva-sh/git-ticket/cmd/git-ticket@${version}`], {
      cwd: tmpdir(), env: { ...process.env, GOBIN: bin, GOFLAGS: '' }, stdio: 'inherit', timeout: 300_000,
    })
    process.env.GIT_TICKET_CANVAS_BROWSER_BIN = bin
  } catch (error) {
    await rm(bin, { recursive: true, force: true })
    throw error
  }
  return () => rm(bin, { recursive: true, force: true })
}

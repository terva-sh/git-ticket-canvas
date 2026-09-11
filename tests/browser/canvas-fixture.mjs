import { execFileSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const defaultArchive = join(repo,
  'docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets/ahpsh-tickets.tgz')
export const expectedTickets = 30

// The archive holds a .tickets store whose tickets reference files from the
// project it came from. Those files are not in the tarball, so the store does
// not validate until the targets exist. Empty files are enough, and creating
// them in the unpacked copy leaves the committed archive alone.
async function ensureReferenceTargets(root) {
  const pending = [join(root, '.tickets')]
  while (pending.length) {
    const directory = pending.pop()
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) { pending.push(path); continue }
      if (!entry.name.endsWith('.md')) continue
      const source = await readFile(path, 'utf8')
      for (const match of source.matchAll(/^\s+path:\s+(.+)$/gm)) {
        const value = match[1].trim().replace(/^['"]|['"]$/g, '')
        const target = resolve(root, value)
        if (!value || value === 'null' || !target.startsWith(`${root}/`)) continue
        await mkdir(dirname(target), { recursive: true })
        try { await access(target) } catch { await writeFile(target, '') }
      }
    }
  }
}

async function countTickets(root) {
  const pending = [join(root, '.tickets')]
  let total = 0
  while (pending.length) {
    const directory = pending.pop()
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) { pending.push(join(directory, entry.name)); continue }
      if (entry.name.startsWith('TKT-') && entry.name.endsWith('.md')) total++
    }
  }
  return total
}

/**
 * Unpack the committed canvas fixture into a store a caller owns.
 *
 * Pass `store` to pin the directory, which a baseline capture needs when the
 * path is visible in the scene. Omit it and every call gets its own `mkdtemp`
 * directory, so two Playwright workers cannot delete each other's store.
 *
 * The committed archive is never written to: `tar` only reads it, and the
 * reference targets are created inside the unpacked copy.
 */
export async function unpackCanvasFixture({ archive = defaultArchive, store } = {}) {
  const root = store
    ? resolve(store)
    : await mkdtemp(join(tmpdir(), 'git-ticket-canvas-fixture-'))
  if (store) {
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
  }
  try {
    execFileSync('tar', ['-xzf', archive, '-C', root])
    await ensureReferenceTargets(root)
    // Fail here rather than inside a caller's assertion, where a short fixture
    // reads as a broken canvas instead of a broken unpack.
    const tickets = await countTickets(root)
    if (tickets !== expectedTickets) {
      throw new Error(`fixture holds ${tickets} tickets, expected ${expectedTickets}`)
    }
    await access(join(root, '.tickets', 'canvas', 'default.yml'))
    return { store: root, tickets, cleanup: () => rm(root, { recursive: true, force: true }) }
  } catch (error) {
    await rm(root, { recursive: true, force: true })
    throw error
  }
}

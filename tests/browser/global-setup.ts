import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export default async function setup() {
  const bin = await mkdtemp(join(tmpdir(), 'tkcanvas-browser-bin-'))
  try {
    for (const [name, source] of [['tkcanvas', '.'], ['init-store', './tests/browser/init-store']]) {
      execFileSync('go', ['build', '-o', join(bin, name), source], {
        cwd: resolve('.'), stdio: 'inherit', timeout: 120_000,
      })
    }
    process.env.TKCANVAS_BROWSER_BIN = bin
  } catch (error) {
    await rm(bin, { recursive: true, force: true })
    throw error
  }
  return () => rm(bin, { recursive: true, force: true })
}

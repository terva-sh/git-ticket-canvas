import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function tree(path, prefix = '') {
  const files = new Map()
  if (!existsSync(path)) return files
  for (const name of readdirSync(path).sort()) {
    const full = join(path, name), relative = prefix + name
    const stat = lstatSync(full)
    if (stat.isDirectory()) {
      for (const entry of tree(full, relative + '/')) files.set(...entry)
    } else if (stat.isFile()) files.set(relative, readFileSync(full))
    else throw new Error(`Unsupported generated entry: ${relative}`)
  }
  return files
}

export function compare(expected, actual, label) {
  const errors = []
  for (const [name, bytes] of expected) {
    if (!actual.has(name)) errors.push(`${label}: missing ${name}`)
    else if (!bytes.equals(actual.get(name))) errors.push(`${label}: changed ${name}`)
  }
  for (const name of actual.keys()) {
    if (!expected.has(name)) errors.push(`${label}: extra ${name}`)
  }
  if (errors.length) throw new Error(errors.join('\n'))
}

function committed(root) {
  const git = (args) => execFileSync('git', args, { cwd: root })
  const names = git(['ls-tree', '-rz', '--name-only', 'HEAD', '--', 'web/dist']).toString().split('\0').filter(Boolean)
  if (!names.length) throw new Error('HEAD has no committed web/dist')
  return new Map(names.map(name => [name.slice('web/dist/'.length), git(['show', `HEAD:${name}`])]))
}

function rebuild(root, scratch) {
  for (const name of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'web']) {
    cpSync(join(root, name), join(scratch, name), { recursive: true })
  }
  rmSync(join(scratch, 'web/dist'), { recursive: true, force: true })
  for (const args of [['ci', '--no-audit', '--no-fund'], ['exec', '--', 'vite', 'build']]) {
    execFileSync('npm', args, { cwd: scratch, stdio: 'inherit', timeout: 120_000 })
  }
}

export function verify(root, build = rebuild) {
  const expected = committed(root)
  compare(expected, tree(join(root, 'web/dist')), 'working dist versus HEAD')
  const scratch = mkdtempSync(join(tmpdir(), 'git-ticket-canvas-dist-'))
  try {
    build(root, scratch)
    compare(expected, tree(join(scratch, 'web/dist')), 'locked rebuild versus HEAD')
    compare(expected, tree(join(root, 'web/dist')), 'working dist after rebuild')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    verify(resolve('.'))
    console.log('Locked rebuild and working dist match HEAD byte for byte.')
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

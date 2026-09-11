import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const justfile = new URL('../../justfile', import.meta.url)

/**
 * Recipe headers with their body, so a test can ask what a recipe forwards.
 * A header is `name params...: deps...` at column zero, and its body is the
 * indented lines under it.
 */
function recipes(source) {
  const found = []
  let current = null
  for (const line of source.split('\n')) {
    const header = /^([a-z][\w-]*)([^:]*):/.exec(line)
    if (header && !line.startsWith(' ')) {
      current = { name: header[1], params: header[2].trim(), body: [] }
      found.push(current)
      continue
    }
    if (current && /^\s+\S/.test(line)) { current.body.push(line.trim()); continue }
    if (!line.trim()) current = null
  }
  return found
}

const variadic = source => recipes(source).filter(recipe => /(^|\s)\*/.test(recipe.params))

test('every variadic recipe declares *args without a default', async () => {
  const source = await readFile(justfile, 'utf8')
  const found = variadic(source)
  assert.ok(found.length >= 8, `expected the variadic recipes to be found, saw ${found.length}`)
  const withDefault = found.filter(recipe => /\*\w+\s*=/.test(recipe.params))
  assert.deepEqual(withDefault.map(recipe => recipe.name), [],
    'a `*args=""` default makes just pass one empty argument when the caller passes none, '
    + 'which a recipe carrying its own filter reads as "match everything"')
})

test('every variadic recipe forwards "$@" rather than {{args}}', async () => {
  const source = await readFile(justfile, 'utf8')
  for (const recipe of variadic(source)) {
    const body = recipe.body.join('\n')
    assert.ok(!body.includes('{{args}}'),
      `${recipe.name} forwards {{args}}, which splits a quoted argument into words`)
    assert.ok(body.includes('"$@"'),
      `${recipe.name} declares *args but never forwards "$@", so its arguments go nowhere`)
  }
})

/**
 * The rule above rests on how just expands each form, which is a property of
 * just rather than of this repository. Assert it directly, so a just upgrade
 * that changes the semantics fails here instead of silently running the wrong
 * tests. The real recipes cannot be exercised without running their test
 * runners, which is what the recipes themselves are for.
 */
test('just expands the forwarding forms as the rule assumes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'recipe-args-'))
  try {
    const path = join(directory, 'probe.just')
    writeFileSync(path, [
      'set positional-arguments',
      '',
      'with_default *args="":',
      '    @set -- "$@"; echo "$#"',
      '',
      'no_default *args:',
      '    @set -- "$@"; echo "$#"',
      '',
      'interp *args:',
      '    @set -- {{args}}; echo "$#"',
      '',
      'dollar *args:',
      '    @set -- "$@"; echo "$#"',
      '',
    ].join('\n'))
    const run = (...args) => {
      const result = spawnSync('just', ['-f', path, ...args], { encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
      return result.stdout.trim()
    }

    assert.equal(run('with_default'), '1',
      'a `*args=""` default passes one empty argument when the caller passes none')
    assert.equal(run('no_default'), '0',
      'a bare `*args` passes nothing when the caller passes none')
    assert.equal(run('interp', 'two words'), '2',
      '{{args}} splits a quoted argument, so `-g "a b"` reaches the runner as two arguments')
    assert.equal(run('dollar', 'two words'), '1',
      '"$@" keeps a quoted argument whole')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

/**
 * A bare `--` before a filter is forwarded literally rather than consumed, which
 * is how `just web-test -- geometry` came to run all 30 test files instead of
 * one. A leading dash needs no escaping, so there is never a reason to type it.
 */
test('just forwards a bare -- literally instead of consuming it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'recipe-dashes-'))
  try {
    const path = join(directory, 'probe.just')
    writeFileSync(path, [
      'set positional-arguments',
      '',
      'seen *args:',
      '    @set -- "$@"; printf "[%s]" "$@"; echo',
      '',
    ].join('\n'))
    const run = (...args) => {
      const result = spawnSync('just', ['-f', path, ...args], { encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
      return result.stdout.trim()
    }

    assert.equal(run('seen', '--list'), '[--list]',
      'a leading dash reaches the recipe unescaped')
    assert.equal(run('seen', '--', '--list'), '[--][--list]',
      'a bare -- is an argument, not a separator just removes')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

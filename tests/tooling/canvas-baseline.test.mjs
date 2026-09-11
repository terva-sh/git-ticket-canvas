import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const artifacts = join(repo, 'docs/artifacts/canvas-review-baseline-2026-09-11/ahpsh-tickets')
const imagePath = join(artifacts, 'canvas-baseline.png')
const metadataPath = join(artifacts, 'canvas-baseline.json')
const historyPath = join(artifacts, 'baseline-history.json')

async function readJSON(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function imageChecksum() {
  return createHash('sha256').update(await readFile(imagePath)).digest('hex')
}

// The visual gate compares against the committed image, so nothing stops a
// person regenerating it. These checks stop it landing silently: the image, the
// metadata beside it and the history entry all have to agree, and the only way
// to make them agree is to run the capture and write down why.

test('the committed baseline matches the newest history entry', async () => {
  const history = await readJSON(historyPath)
  const current = history.baselines[0]
  assert.equal(await imageChecksum(), current.sha256,
    'canvas-baseline.png does not match the newest entry in baseline-history.json. '
    + 'Run `npm run capture:canvas-baseline`, then add an entry saying why the image changed.')
})

test('the metadata describes the committed image', async () => {
  const metadata = await readJSON(metadataPath)
  assert.equal(metadata.pngSha256, await imageChecksum(),
    'canvas-baseline.json describes different bytes than canvas-baseline.png. '
    + 'That happens when the image is rewritten by `playwright --update-snapshots`, '
    + 'which cannot update the metadata. Run `npm run capture:canvas-baseline` instead.')
})

test('every baseline records why it changed', async () => {
  const history = await readJSON(historyPath)
  assert.ok(history.baselines.length > 0, 'baseline-history.json lists no baselines')
  for (const entry of history.baselines) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/, `bad sha256 on ${JSON.stringify(entry)}`)
    assert.match(entry.recordedOn, /^\d{4}-\d{2}-\d{2}$/, `bad recordedOn on ${entry.sha256}`)
    assert.match(entry.ticket, /^TKT-[0-9A-Z]+$/, `bad ticket on ${entry.sha256}`)
    // A reason of a few words is the same as no reason. The next person needs to
    // know what changed in the picture and what made that intentional.
    assert.ok(typeof entry.reason === 'string' && entry.reason.trim().length >= 80,
      `the reason on ${entry.sha256} is too short to tell anyone what changed`)
  }
})

test('no baseline is recorded twice', async () => {
  const history = await readJSON(historyPath)
  const seen = history.baselines.map(entry => entry.sha256)
  assert.equal(new Set(seen).size, seen.length, 'baseline-history.json repeats a sha256')
})

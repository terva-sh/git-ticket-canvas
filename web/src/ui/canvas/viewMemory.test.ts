// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { forget, recall, remember } from './viewMemory'
import { MAX_ZOOM, MIN_ZOOM } from '../../platform/canvas/geometry'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

const key = 'git-ticket-canvas.view.ledger.default'

it('remembers a view per store and per board', () => {
  remember('ledger', 'default', { x: -40, y: 120, k: 1.5 })
  remember('ledger', 'planning', { x: 10, y: 10, k: 0.5 })
  remember('canvas', 'default', { x: 0, y: 0, k: 2 })
  expect(recall('ledger', 'default')).toEqual({ x: -40, y: 120, k: 1.5 })
  expect(recall('ledger', 'planning')).toEqual({ x: 10, y: 10, k: 0.5 })
  expect(recall('canvas', 'default')).toEqual({ x: 0, y: 0, k: 2 })
})

// The half the first version of this left out. A remembered magnification with
// a forgotten pan lands somebody at the right scale on the wrong board.
it('remembers where they were looking, not only how close', () => {
  remember('ledger', 'default', { x: -1840, y: -920, k: 1 })
  expect(recall('ledger', 'default')).toMatchObject({ x: -1840, y: -920 })
})

it('has nothing to say about a board nobody has opened', () => {
  expect(recall('ledger', 'default')).toBeNull()
})

// A level outside what the wheel can reach would strand somebody at a
// magnification they cannot scroll out of. Whatever wrote it was not this, so
// it is discarded rather than clamped.
it('refuses a magnification outside the limits the wheel can reach', () => {
  localStorage.setItem(key, JSON.stringify({ x: 0, y: 0, k: MAX_ZOOM + 1 }))
  expect(recall('ledger', 'default')).toBeNull()
  localStorage.setItem(key, JSON.stringify({ x: 0, y: 0, k: MIN_ZOOM / 2 }))
  expect(recall('ledger', 'default')).toBeNull()
})

it('refuses a record that is not a view', () => {
  for (const raw of ['about this big', '1.5', 'null', '{"k":1}', '{"x":0,"y":0,"k":"1"}']) {
    localStorage.setItem(key, raw)
    expect(recall('ledger', 'default')).toBeNull()
  }
})

it('forgets on request', () => {
  remember('ledger', 'default', { x: 1, y: 2, k: 1.5 })
  forget('ledger', 'default')
  expect(recall('ledger', 'default')).toBeNull()
})

// Private browsing and a full quota both throw on access. A board that will not
// open because it could not remember where it was would be a poor trade.
it('survives storage that throws', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
  expect(() => remember('ledger', 'default', { x: 1, y: 2, k: 1.5 })).not.toThrow()
  expect(recall('ledger', 'default')).toBeNull()
})

it('writes nothing for a store or board it was not given', () => {
  remember('', 'default', { x: 1, y: 2, k: 1.5 })
  remember('ledger', '', { x: 1, y: 2, k: 1.5 })
  expect(localStorage.length).toBe(0)
})

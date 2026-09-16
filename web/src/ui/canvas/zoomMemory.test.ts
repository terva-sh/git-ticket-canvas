// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { forget, recall, remember } from './zoomMemory'
import { MAX_ZOOM, MIN_ZOOM } from '../../platform/canvas/geometry'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

it('remembers a level per store and per board', () => {
  remember('ledger', 'default', 1.5)
  remember('ledger', 'planning', 0.5)
  remember('canvas', 'default', 2)
  expect(recall('ledger', 'default')).toBeCloseTo(1.5)
  expect(recall('ledger', 'planning')).toBeCloseTo(0.5)
  expect(recall('canvas', 'default')).toBeCloseTo(2)
})

it('has nothing to say about a board nobody has opened', () => {
  expect(recall('ledger', 'default')).toBeNull()
})

// A level outside what the wheel can reach would strand somebody at a
// magnification they cannot scroll out of. Whatever wrote it was not this, so
// it is discarded rather than clamped.
it('refuses a level outside the limits the wheel can reach', () => {
  localStorage.setItem('git-ticket-canvas.zoom.ledger.default', String(MAX_ZOOM + 1))
  expect(recall('ledger', 'default')).toBeNull()
  localStorage.setItem('git-ticket-canvas.zoom.ledger.default', String(MIN_ZOOM / 2))
  expect(recall('ledger', 'default')).toBeNull()
})

it('refuses something that is not a number', () => {
  localStorage.setItem('git-ticket-canvas.zoom.ledger.default', 'about this big')
  expect(recall('ledger', 'default')).toBeNull()
})

it('forgets on request', () => {
  remember('ledger', 'default', 1.5)
  forget('ledger', 'default')
  expect(recall('ledger', 'default')).toBeNull()
})

// Private browsing and a full quota both throw on access. A board that will not
// open because it could not remember how big it was would be a poor trade.
it('survives storage that throws', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
  expect(() => remember('ledger', 'default', 1.5)).not.toThrow()
  expect(recall('ledger', 'default')).toBeNull()
})

it('writes nothing for a store or board it was not given', () => {
  remember('', 'default', 1.5)
  remember('ledger', '', 1.5)
  expect(localStorage.length).toBe(0)
})

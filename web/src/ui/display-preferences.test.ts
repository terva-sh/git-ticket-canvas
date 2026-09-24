// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { forget, recall, remember } from './displayPreferences'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

const KEY = 'git-ticket-canvas.display'

it('keeps only what somebody actually set', () => {
  remember({ density: 'full' })
  expect(recall()).toEqual({ density: 'full' })
  expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ density: 'full' })
})

// The point of storing overrides rather than settings: changing the rules in
// platform/canvas/viewport.ts should reach everybody who never disagreed, and
// nobody who did.
it('has nothing to say about a setting nobody overrode', () => {
  remember({ targets: 'coarse' })
  expect(recall().density).toBeUndefined()
  expect(recall().inspector).toBeUndefined()
})

it('treats an empty set of overrides as the absence of a record', () => {
  remember({ density: 'compact' })
  remember({})
  expect(localStorage.getItem(KEY)).toBeNull()
  expect(recall()).toEqual({})
})

it('forgets on request', () => {
  remember({ density: 'compact', inspector: 'over' })
  forget()
  expect(recall()).toEqual({})
})

// A value written by a later version, or by hand, would otherwise select a
// layout this version does not have.
it('drops a value it does not recognise rather than trusting it', () => {
  localStorage.setItem(KEY, JSON.stringify({ density: 'enormous', inspector: 'beside', targets: 7 }))
  expect(recall()).toEqual({ inspector: 'beside' })
  for (const raw of ['null', '"compact"', '[]', 'not json']) {
    localStorage.setItem(KEY, raw)
    expect(recall(), raw).toEqual({})
  }
})

// `recall` rebuilds the record from an allowlist per key, so a layout without
// one would be written and then dropped on every reload.
it('keeps a layout across a reload, and drops one it does not know', () => {
  for (const layout of ['phone', 'tablet', 'desk'] as const) {
    remember({ layout })
    expect(recall(), layout).toEqual({ layout })
  }
  remember({ layout: 'tablet', density: 'full' })
  expect(recall()).toEqual({ layout: 'tablet', density: 'full' })
  localStorage.setItem(KEY, JSON.stringify({ layout: 'watch', density: 'compact' }))
  expect(recall()).toEqual({ density: 'compact' })
  localStorage.setItem(KEY, JSON.stringify({ layout: 3 }))
  expect(recall()).toEqual({})
})

// Private browsing and a full quota both throw on access. A board that will not
// open because it could not read a preference would be a poor trade.
it('survives storage that throws', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
  expect(() => remember({ density: 'compact' })).not.toThrow()
  expect(recall()).toEqual({})
})

// The phone's first-visit tip is remembered here, and `recall` rebuilds the
// record key by key, so without its own line it would come back every visit.
it('keeps a closed tip across a reload, and drops anything else under its key', () => {
  remember({ tipClosed: true })
  expect(recall()).toEqual({ tipClosed: true })
  remember({ tipClosed: true, toolbar: 'large', layout: 'phone' })
  expect(recall()).toEqual({ tipClosed: true, toolbar: 'large', layout: 'phone' })
  for (const value of [false, 'true', 1, null]) {
    localStorage.setItem(KEY, JSON.stringify({ tipClosed: value, density: 'compact' }))
    expect(recall(), JSON.stringify(value)).toEqual({ density: 'compact' })
  }
})

// The list is a choice somebody makes and expects back after a reload. The
// board is the absence of a record, so anything but `list` under the key reads
// as the board rather than as a view this version does not have.
it('keeps the list across a reload, and reads anything else under its key as the board', () => {
  remember({ view: 'list' })
  expect(recall()).toEqual({ view: 'list' })
  for (const value of ['board', 'grid', true, null]) {
    localStorage.setItem(KEY, JSON.stringify({ view: value, density: 'compact' }))
    expect(recall(), JSON.stringify(value)).toEqual({ density: 'compact' })
  }
})

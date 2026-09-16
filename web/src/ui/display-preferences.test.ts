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

// Private browsing and a full quota both throw on access. A board that will not
// open because it could not read a preference would be a poor trade.
it('survives storage that throws', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
  expect(() => remember({ density: 'compact' })).not.toThrow()
  expect(recall()).toEqual({})
})

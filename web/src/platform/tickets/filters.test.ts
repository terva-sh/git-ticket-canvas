import { describe, expect, it } from 'vitest'
import { cycleLabel, labelUniverse, matchesTicket, type LabelFilters } from './filters'
import type { Ticket } from './types'

const ticket = (id: string, labels: string[], status = 'ready', description = ''): Ticket => ({
  id, short: id, title: `Ticket ${id}`, type: 'task', status, priority: 'normal', labels,
  assignees: [], dependencies: [], blocksOn: 'none', references: [], archived: false,
  createdAt: '', updatedAt: '', revision: `rev-${id}`, body: { description },
} as unknown as Ticket)

const labels = (entries: Record<string, 'include' | 'exclude'>): LabelFilters => new Map(Object.entries(entries))
const none: LabelFilters = new Map()
const all = new Set<string>()

describe('Label filter states', () => {
  it('cycles one label from unselected to include to exclude and back', () => {
    const first = cycleLabel(none, 'ui')
    expect(first.get('ui')).toBe('include')
    const second = cycleLabel(first, 'ui')
    expect(second.get('ui')).toBe('exclude')
    const third = cycleLabel(second, 'ui')
    expect(third.has('ui')).toBe(false)
  })
  it('returns a new map and leaves the previous state untouched', () => {
    const before = labels({ ui: 'include' })
    const after = cycleLabel(before, 'canvas')
    expect(after).not.toBe(before)
    expect([...before]).toEqual([['ui', 'include']])
    expect(after.get('ui')).toBe('include')
    expect(after.get('canvas')).toBe('include')
  })
  it('holds only the labels in a state, so an untouched store adds nothing', () => {
    expect([...cycleLabel(cycleLabel(cycleLabel(none, 'ui'), 'ui'), 'ui')]).toEqual([])
  })
})

describe('The label universe', () => {
  it('unions configured labels with the ones tickets carry, sorted and deduplicated', () => {
    const result = labelUniverse(['release'], [ticket('a', ['ui', 'canvas']), ticket('b', ['ui'])])
    expect(result).toEqual(['canvas', 'release', 'ui'])
  })
  it('keeps a configured label that no ticket uses', () => {
    expect(labelUniverse(['unused'], [ticket('a', [])])).toEqual(['unused'])
  })
  // This store has `labels: []` in config.yml because it does not enforce them.
  // A universe built from configuration alone would be empty here.
  it('falls back to the labels in use when the store configures none', () => {
    expect(labelUniverse([], [ticket('a', ['idea', 'ui'])])).toEqual(['idea', 'ui'])
    expect(labelUniverse(undefined, [ticket('a', ['idea'])])).toEqual(['idea'])
  })
  it('treats labels as exact strings, so case is not folded together', () => {
    expect(labelUniverse([], [ticket('a', ['UI', 'ui'])])).toEqual(['UI', 'ui'])
  })
})

describe('Combining label, status, and search filters', () => {
  const card = ticket('a', ['ui', 'canvas'], 'ready', 'a body mentioning backend')
  it('matches everything when nothing is filtered', () => {
    expect(matchesTicket(card, { statuses: all, labels: none, query: '' })).toBe(true)
  })
  it('narrows with each include, so two includes require both labels', () => {
    expect(matchesTicket(card, { statuses: all, labels: labels({ ui: 'include' }), query: '' })).toBe(true)
    expect(matchesTicket(card, { statuses: all, labels: labels({ ui: 'include', canvas: 'include' }), query: '' })).toBe(true)
    expect(matchesTicket(card, { statuses: all, labels: labels({ ui: 'include', absent: 'include' }), query: '' })).toBe(false)
  })
  it('lets an exclude win over an include the card also satisfies', () => {
    expect(matchesTicket(card, { statuses: all, labels: labels({ ui: 'include', canvas: 'exclude' }), query: '' })).toBe(false)
  })
  it('excludes a whole band without naming the labels to keep', () => {
    expect(matchesTicket(card, { statuses: all, labels: labels({ canvas: 'exclude' }), query: '' })).toBe(false)
    expect(matchesTicket(ticket('b', ['idea']), { statuses: all, labels: labels({ canvas: 'exclude' }), query: '' })).toBe(true)
  })
  it('ands label filters with status filters', () => {
    const matching = labels({ ui: 'include' }), missing = labels({ absent: 'include' })
    expect(matchesTicket(card, { statuses: new Set(['ready']), labels: matching, query: '' })).toBe(true)
    expect(matchesTicket(card, { statuses: new Set(['done']), labels: matching, query: '' })).toBe(false)
    expect(matchesTicket(card, { statuses: new Set(['ready']), labels: missing, query: '' })).toBe(false)
    expect(matchesTicket(card, { statuses: new Set(['done']), labels: missing, query: '' })).toBe(false)
  })
  it('ands label filters with the search query', () => {
    expect(matchesTicket(card, { statuses: all, labels: labels({ ui: 'include' }), query: 'backend' })).toBe(true)
    expect(matchesTicket(card, { statuses: all, labels: labels({ ui: 'include' }), query: 'absent' })).toBe(false)
    expect(matchesTicket(card, { statuses: all, labels: labels({ ui: 'exclude' }), query: 'backend' })).toBe(false)
  })
  it('searches the fields the toolbar always searched, ignoring case and surrounding space', () => {
    expect(matchesTicket(card, { statuses: all, labels: none, query: '  TICKET A ' })).toBe(true)
    expect(matchesTicket(card, { statuses: all, labels: none, query: 'canvas' })).toBe(true)
    expect(matchesTicket(card, { statuses: all, labels: none, query: 'nothing here' })).toBe(false)
  })
  it('matches a card with no labels unless an include asks for one', () => {
    const bare = ticket('b', [])
    expect(matchesTicket(bare, { statuses: all, labels: none, query: '' })).toBe(true)
    expect(matchesTicket(bare, { statuses: all, labels: labels({ ui: 'exclude' }), query: '' })).toBe(true)
    expect(matchesTicket(bare, { statuses: all, labels: labels({ ui: 'include' }), query: '' })).toBe(false)
  })
})

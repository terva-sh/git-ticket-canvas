import { describe, expect, it } from 'vitest'
import { cycleLabel, emptyBoardHelp, labelUniverse, matchesTicket, type LabelFilters } from './filters'
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

describe('How the required labels combine', () => {
  const card = ticket('a', ['ui', 'canvas'])
  const both = labels({ ui: 'include', canvas: 'include' })
  const one = labels({ ui: 'include', absent: 'include' })

  it('defaults to requiring every label, which is what the board always did', () => {
    expect(matchesTicket(card, { statuses: all, labels: one, query: '' })).toBe(false)
    expect(matchesTicket(card, { statuses: all, labels: one, labelMatch: 'all', query: '' })).toBe(false)
  })
  it('accepts a card carrying only one of them under any', () => {
    expect(matchesTicket(card, { statuses: all, labels: one, labelMatch: 'any', query: '' })).toBe(true)
    expect(matchesTicket(card, { statuses: all, labels: both, labelMatch: 'any', query: '' })).toBe(true)
  })
  it('still rejects a card carrying none of them under any', () => {
    const other = ticket('b', ['idea'])
    expect(matchesTicket(other, { statuses: all, labels: one, labelMatch: 'any', query: '' })).toBe(false)
  })
  // The mode says how the required labels join. It is not an invitation to show
  // a ticket the user struck out, so excluding stays an AND on both settings.
  it('keeps an exclude winning under any', () => {
    expect(matchesTicket(card, { statuses: all, labels: labels({ ui: 'include', canvas: 'exclude' }), labelMatch: 'any', query: '' })).toBe(false)
  })
  // The trap: asking whether any of an empty set is present answers no, which
  // would empty a board whose filter only ever excluded.
  it('does not empty the board when any is set and nothing is required', () => {
    expect(matchesTicket(card, { statuses: all, labels: labels({ idea: 'exclude' }), labelMatch: 'any', query: '' })).toBe(true)
    expect(matchesTicket(card, { statuses: all, labels: none, labelMatch: 'any', query: '' })).toBe(true)
  })
  it('makes no difference at one required label, which is why the summary stays quiet there', () => {
    for (const labelMatch of ['all', 'any'] as const) {
      expect(matchesTicket(card, { statuses: all, labels: labels({ ui: 'include' }), labelMatch, query: '' })).toBe(true)
      expect(matchesTicket(card, { statuses: all, labels: labels({ absent: 'include' }), labelMatch, query: '' })).toBe(false)
    }
  })
})

describe('Explaining a board the filters emptied', () => {
  const store = [ticket('a', ['ui', 'canvas']), ticket('b', ['ui']), ticket('c', ['multiuser'], 'done')]
  const filters = (over: Partial<Parameters<typeof matchesTicket>[1]> = {}) =>
    ({ statuses: all, labels: none, query: '', ...over })

  it('says nothing while the board still has something on it', () => {
    expect(emptyBoardHelp(store, filters())).toBeUndefined()
    expect(emptyBoardHelp(store, filters({ labels: labels({ ui: 'include' }) }))).toBeUndefined()
  })
  // An empty store is not a filtering outcome, and there is no clause to drop.
  it('says nothing about an empty store', () => {
    expect(emptyBoardHelp([], filters({ labels: labels({ ui: 'include' }) }))).toBeUndefined()
  })
  it('names the labels when they are the whole reason', () => {
    const help = emptyBoardHelp(store, filters({ labels: labels({ ui: 'include', multiuser: 'include' }) }))
    expect(help?.reason).toBe('No ticket carries all 2 of ui and multiuser.')
  })
  it('reads the conjunction off the mode, so any says or', () => {
    const help = emptyBoardHelp(store, filters({ labels: labels({ x: 'include', y: 'include' }), labelMatch: 'any' }))
    expect(help?.reason).toBe('No ticket carries x or y.')
  })
  // With a status or a search also in force, any of them could be doing the
  // work, and guessing which would be worse than the offers already say.
  it('stays general when the labels are not the only clause', () => {
    const help = emptyBoardHelp(store, filters({ labels: labels({ ui: 'include' }), statuses: new Set(['done']) }))
    expect(help?.reason).toBe('No ticket matches every filter in force.')
  })
  it('offers to reinterpret the labels before dropping them, and counts both', () => {
    const help = emptyBoardHelp(store, filters({ labels: labels({ ui: 'include', multiuser: 'include' }) }))
    expect(help?.offers.map(offer => [offer.kind, offer.count])).toEqual([['labelMatch', 3], ['labels', 3]])
  })
  // Ranking by count would lead with whichever returns most, which here is the
  // one that throws the selection away. Smallest change first instead.
  it('offers the reinterpretation ahead of the discard even when it returns fewer', () => {
    // `e` carries neither required label, so clearing returns it and matching
    // any does not. That gap is the whole point of the fixture.
    const narrow = [...store, ticket('d', ['ui', 'idea']), ticket('e', ['idea'])]
    const help = emptyBoardHelp(narrow, filters({ labels: labels({ ui: 'include', multiuser: 'include' }) }))
    const [first, second] = help?.offers || []
    expect([first.kind, second.kind]).toEqual(['labelMatch', 'labels'])
    expect(first.count).toBeLessThan(second.count)
  })
  it('drops an offer that would still leave the board empty', () => {
    const help = emptyBoardHelp(store, filters({ labels: labels({ absent: 'include' }), query: 'nothing here' }))
    expect(help?.offers.map(offer => offer.kind)).toEqual([])
  })
  it('offers each clause in force separately', () => {
    const help = emptyBoardHelp(store, filters({ labels: labels({ ui: 'include' }), statuses: new Set(['done']), query: 'Ticket' }))
    expect(help?.offers.map(offer => offer.kind).sort()).toEqual(['labels', 'statuses'])
  })
  // The mode offer is only meaningful above one required label; at one it would
  // promise a change that selects exactly the same tickets.
  it('does not offer any when only one label is required', () => {
    const help = emptyBoardHelp(store, filters({ labels: labels({ absent: 'include' }) }))
    expect(help?.offers.some(offer => offer.kind === 'labelMatch')).toBe(false)
  })
})

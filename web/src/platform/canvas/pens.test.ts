import { describe, expect, it } from 'vitest'
import { evaluatePens } from './pens'
import type { Cards, Pen, Routing } from '../tickets/types'

const pen = (requiredLabels: string[]): Pen => ({ title: 'Pen', x: 0, y: 0, w: 500, h: 300, color: '#759bcc', pin: { x: 20, y: 30 }, requiredLabels })
function routing(rules: Record<string, string[]>, ruleOrder = Object.keys(rules)): Routing {
  return { pens: Object.fromEntries(Object.entries(rules).map(([id, labels]) => [id, pen(labels)])), ruleOrder, inbox: { x: -500, y: 0 } }
}
const ticket = (id: string, labels: string[]) => ({ id, labels })
const destination = (penId: string) => ({ kind: 'pen', penId })
const inbox = { kind: 'inbox' }
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}

describe('Pure pen evaluation', () => {
  it('requires every independent label, allows extras, and treats duplicates as one requirement', () => {
    const rules = routing({ base: ['UI', 'UI'], specific: ['UI', 'bug', 'bug'] })
    const result = evaluatePens(rules, [ticket('extra', ['UI', 'bug', 'extra']), ticket('base', ['UI', 'UI']), ticket('none', ['bug'])], {})
    expect(result.tickets.get('extra')?.destination).toEqual(destination('specific'))
    expect(result.tickets.get('base')?.destination).toEqual(destination('base'))
    expect(result.tickets.get('none')?.destination).toEqual(inbox)
    expect(result.tickets.get('extra')?.candidates.map(c => c.specificity)).toEqual([1, 2])
    expect(result.tickets.get('none')?.candidates[1]).toMatchObject({ matchedLabels: ['bug'], missingLabels: ['UI'], outcome: 'missing-labels' })
  })
  it('uses exact case, whitespace, commas, and custom labels without splitting or trimming', () => {
    const rules = routing({ exact: ['UI', 'a,b', 'has spaces', ' custom '] })
    const inputs = [ticket('yes', ['UI', 'a,b', 'has spaces', ' custom ']), ticket('case', ['ui', 'a,b', 'has spaces', ' custom ']),
      ticket('split', ['UI', 'a', 'b', 'has spaces', ' custom ']), ticket('trim', ['UI', 'a,b', 'has spaces', 'custom'])]
    const result = evaluatePens(rules, inputs, {})
    expect([...result.tickets.values()].map(t => t.destination)).toEqual([destination('exact'), inbox, inbox, inbox])
  })
  it('resolves ties by explicit order regardless of map order and explains all candidates', () => {
    const rules = routing({ base: ['UI'], bugs: ['UI', 'bug'], urgent: ['UI', 'urgent'], security: ['UI', 'bug', 'security'] }, ['base', 'urgent', 'bugs', 'security'])
    const result = evaluatePens(rules, [ticket('tie', ['UI', 'bug', 'urgent']), ticket('specific', ['UI', 'bug', 'urgent', 'security'])], {})
    const tie = result.tickets.get('tie')!
    expect(tie.destination).toEqual(destination('urgent')); expect(tie.winnerReason).toBe('rule-order')
    expect(tie.candidates).toEqual([
      { penId: 'base', order: 0, specificity: 1, matchedLabels: ['UI'], missingLabels: [], outcome: 'lower-specificity' },
      { penId: 'urgent', order: 1, specificity: 2, matchedLabels: ['UI', 'urgent'], missingLabels: [], outcome: 'winner' },
      { penId: 'bugs', order: 2, specificity: 2, matchedLabels: ['UI', 'bug'], missingLabels: [], outcome: 'later-rule' },
      { penId: 'security', order: 3, specificity: 3, matchedLabels: ['UI', 'bug'], missingLabels: ['security'], outcome: 'missing-labels' },
    ])
    expect(result.tickets.get('specific')?.destination).toEqual(destination('security'))
    expect(result.tickets.get('specific')?.winnerReason).toBe('specificity')
    const reordered = { ...rules, ruleOrder: ['base', 'bugs', 'urgent', 'security'] }
    const changed = evaluatePens(reordered, [ticket('tie', ['UI', 'bug', 'urgent'])], {})
    expect(changed.tickets.get('tie')?.destination).toEqual(destination('bugs'))
    expect(tie.destination).toEqual(destination('urgent'))
  })
  it('explains the sole match and unmatched Inbox without making Inbox a rule', () => {
    const result = evaluatePens(routing({ p: ['x'] }), [ticket('one', ['x']), ticket('none', [])], {})
    expect(result.tickets.get('one')?.winnerReason).toBe('only-match')
    expect(result.tickets.get('none')).toMatchObject({ destination: inbox, potentialDestination: inbox, winnerReason: 'inbox' })
    const empty = evaluatePens(routing({}), [ticket('auto', ['x']), ticket('manual', [])], { manual: { x: 1, y: 2 } })
    expect(empty.tickets.get('auto')?.candidates).toEqual([])
    expect(empty.counts.inbox).toBe(1); expect(empty.counts.pens.size).toBe(0); expect(empty.overlaps).toEqual([])
  })
  it('counts every automatic winner, including filtered tickets, but not manual or merely enclosed cards', () => {
    const all = [ticket('visible', ['x']), { ...ticket('filtered', ['x']), status: 'done' }, ticket('manual', ['x']), ticket('unmatched', []), ticket('manual-inbox', [])]
    const cards = { manual: { x: 20, y: 30 }, 'manual-inbox': { x: 40, y: 30 }, deleted: { x: 1, y: 2 } }
    const result = evaluatePens(routing({ p: ['x'], unused: ['never'] }), all, cards)
    expect(result.counts.pens).toEqual(new Map([['p', 2], ['unused', 0]])); expect(result.counts.inbox).toBe(1)
    expect(result.tickets.get('manual')).toMatchObject({ manual: true, destination: null, potentialDestination: destination('p') })
    expect(result.tickets.get('manual-inbox')).toMatchObject({ manual: true, destination: null, potentialDestination: inbox })
    expect(result.tickets.size).toBe(5)
  })
  it('routes a pen named inbox independently from the built-in Inbox', () => {
    const result = evaluatePens(routing({ inbox: ['x'] }), [ticket('p', ['x']), ticket('i', [])], {})
    expect(result.tickets.get('p')?.destination).toEqual(destination('inbox')); expect(result.tickets.get('i')?.destination).toEqual(inbox)
    expect(result.counts.pens.get('inbox')).toBe(1); expect(result.counts.inbox).toBe(1)
  })
  it('does not confuse inherited object properties with pens, tickets, or manual positions', () => {
    const rules = routing({ constructor: ['x'], toString: ['x', 'y'] }, ['constructor', 'toString'])
    const result = evaluatePens(rules, [ticket('constructor', ['x']), ticket('__proto__', ['x', 'y'])], {})
    expect(result.counts.pens.get('constructor')).toBe(1); expect(result.counts.pens.get('toString')).toBe(1)
    expect(result.tickets.get('__proto__')?.manual).toBe(false)
  })
  it('reevaluates supplied labels, removals, and manual overrides without retaining derived state', () => {
    const rules = routing({ base: ['x'], specific: ['x', 'y'] })
    const first = evaluatePens(rules, [ticket('a', ['x', 'y'])], {})
    const changed = evaluatePens(rules, [ticket('a', ['x']), ticket('new', ['x', 'y'])], {})
    expect(changed.tickets.get('a')?.destination).toEqual(destination('base')); expect(changed.counts.pens.get('specific')).toBe(1)
    const removed = evaluatePens(routing({ base: ['x'] }), [ticket('a', ['x', 'y'])], {})
    expect(removed.tickets.get('a')?.destination).toEqual(destination('base'))
    expect(evaluatePens(routing({}), [ticket('a', ['x', 'y'])], {}).tickets.get('a')?.destination).toEqual(inbox)
    expect(evaluatePens(rules, [ticket('a', ['x', 'y'])], { a: { x: 1, y: 2 } }).tickets.get('a')?.destination).toBeNull()
    expect(first.tickets.get('a')?.destination).toEqual(destination('specific'))
    expect(evaluatePens(rules, [], {}).tickets.size).toBe(0)
  })
  it('accepts frozen inputs and iterators without mutating authored geometry, labels, or membership', () => {
    const rules = freeze(routing({ p: ['x', 'x'] })), inputs = freeze([ticket('a', ['x'])]), cards: Cards = freeze({})
    const before = JSON.stringify({ rules, inputs, cards })
    const result = evaluatePens(rules, inputs.values(), cards)
    expect(result.tickets.get('a')?.destination).toEqual(destination('p'))
    expect(JSON.stringify({ rules, inputs, cards })).toBe(before)
    expect(result.tickets.get('a')?.candidates[0].matchedLabels).not.toBe(rules.pens.p.requiredLabels)
  })
  it('accepts routing carried by a board without using geometry or frame membership as assignments', () => {
    const board = freeze({ ...routing({ p: ['x'] }), schema: 3, board: 'default',
      cards: { manual: { x: 999, y: 999 } }, frames: { f: { members: ['auto', 'manual'] } } })
    const all = [ticket('auto', ['x']), ticket('manual', ['x'])]
    const result = evaluatePens(board, all, board.cards)
    expect(result.tickets.get('auto')?.destination).toEqual(destination('p'))
    expect(result.tickets.get('manual')?.destination).toBeNull()
    expect(board.frames.f.members).toEqual(['auto', 'manual'])
  })
  it('rejects duplicate ticket identities rather than silently inflating counts', () => {
    expect(() => evaluatePens(routing({ p: ['x'] }), [ticket('a', ['x']), ticket('a', ['x'])], {})).toThrow('Duplicate ticket identity')
  })
  it.each([[], [' '], ['\t'], null].map(labels => ({ labels })))('rejects invalid required labels $labels instead of creating a catch-all', ({ labels }) => {
    const rules = routing({ p: labels as string[] })
    expect(() => evaluatePens(rules, [ticket('a', [])], {})).toThrow()
  })
  it.each([['p', 'p'], ['missing'], []].map(order => ({ order })))('rejects incomplete or ambiguous explicit order $order', ({ order }) => {
    expect(() => evaluatePens(routing({ p: ['x'] }, order), [], {})).toThrow()
  })
  it('agrees with a simple exhaustive matching oracle across label sets and rule permutations', () => {
    const requirements = { a: ['x'], b: ['y', 'y'], c: ['x', 'z'], d: ['y', 'z'], e: ['x', 'y', 'z'] }
    const permutations = [['a', 'b', 'c', 'd', 'e'], ['e', 'd', 'c', 'b', 'a'], ['b', 'd', 'a', 'e', 'c']]
    for (const order of permutations) {
      const all = Array.from({ length: 8 }, (_, bits) => ticket(String(bits), ['x', 'y', 'z'].filter((_, i) => bits & (1 << i))))
      const rules = routing(requirements, order), result = evaluatePens(rules, all, {})
      for (const t of all) {
        const matches = order.filter(id => rules.pens[id].requiredLabels.every(label => t.labels.includes(label)))
        matches.sort((a, b) => new Set(rules.pens[b].requiredLabels).size - new Set(rules.pens[a].requiredLabels).size)
        expect(result.tickets.get(t.id)?.destination).toEqual(matches.length ? destination(matches[0]) : inbox)
      }
      expect([...result.counts.pens.values()].reduce((a, b) => a + b, result.counts.inbox)).toBe(all.length)
    }
  })
})

describe('Rule overlaps', () => {
  it('reports potential equal-specificity overlaps even with disjoint requirements and no tickets', () => {
    const result = evaluatePens(routing({ a: ['x'], b: ['y'] }), [], {})
    expect(result.overlaps).toEqual([{ earlier: 'a', later: 'b', relation: 'disjoint', equalSpecificity: true,
      requiredLabels: ['x', 'y'], automaticMatches: 0, manualMatches: 0, topSpecificityTies: 0, outrankedMatches: 0, specificityResolvedMatches: 0 }])
  })
  it.each([
    [['x'], ['x', 'x'], 'equal'], [['x'], ['x', 'y'], 'earlier-subset'],
    [['x', 'y'], ['x'], 'later-subset'], [['x', 'y'], ['x', 'z'], 'intersecting'],
  ] as const)('classifies requirement sets %j and %j as %s', (a, b, relation) => {
    const overlap = evaluatePens(routing({ a: [...a], b: [...b] }), [], {}).overlaps[0]
    expect(overlap.relation).toBe(relation)
    expect(overlap.requiredLabels).toEqual([...new Set([...a, ...b])])
  })
  it('separates automatic top-specificity ties, manual matches, and higher-specificity winners including hidden tickets', () => {
    const rules = routing({ base: ['UI'], bugs: ['UI', 'bug'], urgent: ['UI', 'urgent'], security: ['UI', 'bug', 'security'] })
    const all = [ticket('tie', ['UI', 'bug', 'urgent']), { ...ticket('hidden', ['UI', 'bug', 'urgent']), status: 'done' },
      ticket('manual', ['UI', 'bug', 'urgent']), ticket('higher', ['UI', 'bug', 'urgent', 'security']), ticket('partial', ['UI', 'bug'])]
    const result = evaluatePens(rules, all, { manual: { x: 1, y: 2 } })
    const tie = result.overlaps.find(o => o.earlier === 'bugs' && o.later === 'urgent')!
    expect(tie).toMatchObject({ automaticMatches: 3, manualMatches: 1, topSpecificityTies: 2, outrankedMatches: 1, specificityResolvedMatches: 0 })
    const subset = result.overlaps.find(o => o.earlier === 'base' && o.later === 'bugs')!
    expect(subset).toMatchObject({ equalSpecificity: false, automaticMatches: 4, manualMatches: 1, topSpecificityTies: 0, outrankedMatches: 1, specificityResolvedMatches: 3 })
  })
  it('counts a three-way top-specificity tie for each pair without double-counting destinations', () => {
    const rules = routing({ a: ['x'], b: ['y'], c: ['z'] })
    const result = evaluatePens(rules, [ticket('t', ['x', 'y', 'z'])], {})
    expect(result.overlaps.map(o => o.topSpecificityTies)).toEqual([1, 1, 1])
    expect(result.counts.pens).toEqual(new Map([['a', 1], ['b', 0], ['c', 0]]))
    expect(result.tickets.get('t')?.candidates.map(c => c.outcome)).toEqual(['winner', 'later-rule', 'later-rule'])
  })
})

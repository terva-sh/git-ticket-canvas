import { describe, expect, it } from 'vitest'
import { autoPlace, LANE_GAP, LANE_W, ROW_PITCH } from './geometry'
import { explain, failures, penHeight, resolveBoard, type RuleTicket } from './resolve'
import type { Match, Routing } from '../tickets/types'

const statuses = ['draft', 'ready', 'in-progress', 'blocked', 'review', 'done', 'archived']
const priorities = ['low', 'normal', 'high', 'urgent']
/** A rule naming only the fields a case is about; the rest test nothing. */
const rule = (over: Partial<Match> = {}): Match => ({ labels: [], status: [], type: [], parent: [], ...over })
const pen = (over: Partial<Routing['pens'][string]> = {}) => ({
  title: 'Pen', x: 0, y: 0, w: 1000, h: 600, color: '#759bcc', pin: { x: 0, y: 0 }, match: rule({ labels: ['frontend'] }), ...over,
})
const board = (): Routing => ({
  pens: {
    fe: pen({ title: 'Frontend', match: rule({ labels: ['frontend'] }) }),
    'fe-bugs': pen({ title: 'Frontend bugs', x: 1200, match: rule({ labels: ['frontend', 'bug'] }) }),
    backend: pen({ title: 'Backend', y: 800, match: rule({ labels: ['backend'] }) }),
  },
  ruleOrder: ['fe', 'fe-bugs', 'backend'],
  inbox: { x: -400, y: 0 },
})
const t = (id: string, labels: string[], status = 'ready', priority = 'normal'): RuleTicket => ({ id, labels, status, priority })
/** A ticket that carries whichever of the four fields a case is about. */
const ticket = (over: Partial<RuleTicket> = {}): RuleTicket => ({ id: 'a', labels: [], status: 'ready', ...over })
const one = (match: Match): Routing => ({ pens: { p: pen({ match }) }, ruleOrder: ['p'], inbox: { x: -400, y: 0 } })

describe('resolveBoard', () => {
  it('places an unpinned card by the first pen in ruleOrder whose labels it carries', () => {
    const r = resolveBoard([t('a', ['frontend', 'bug'])], board(), {}, statuses, priorities)
    expect(r.ruled).toBe(true)
    // fe-bugs is the closer fit and loses, because the order is the contract.
    expect(r.explanations.get('a')?.destination).toEqual({ kind: 'pen', id: 'fe' })
    expect(r.explanations.get('a')?.candidates.map(c => c.outcome)).toEqual(['winner', 'later-rule', 'no-match'])
    expect(r.positions.get('a')).toEqual({ x: LANE_GAP, y: LANE_GAP })
  })

  it('keeps a pinned card where it is, whatever the rules say, and still says where it would go', () => {
    const r = resolveBoard([t('a', ['frontend'])], board(), { a: { x: 5000, y: 5000 } }, statuses, priorities)
    expect(r.positions.has('a')).toBe(false)
    expect(r.explanations.get('a')).toMatchObject({ pinned: true, destination: { kind: 'pen', id: 'fe' } })
    expect(r.pens.get('fe')?.count).toBe(0)
  })

  it('lands a card matching no pen at the inbox, one below the other', () => {
    const r = resolveBoard([t('b', ['docs']), t('a', [])], board(), {}, statuses, priorities)
    expect(r.explanations.get('a')?.destination).toEqual({ kind: 'inbox' })
    expect(r.positions.get('a')).toEqual({ x: -400, y: LANE_GAP })
    expect(r.positions.get('b')).toEqual({ x: -400, y: LANE_GAP + ROW_PITCH })
    expect(r.inbox).toBe(2)
  })

  it('places a board with no pens exactly as autoPlace does', () => {
    const items = [t('d', ['x'], 'ready'), t('c', [], 'done'), t('b', [], 'draft'), t('a', [], 'ready')]
    const pinned = { c: { x: 1, y: 2 } }
    const r = resolveBoard(items, { pens: {}, ruleOrder: [], inbox: { x: 0, y: 0 } }, pinned, statuses, priorities)
    expect(r.ruled).toBe(false)
    expect([...r.positions]).toEqual([...autoPlace(items, pinned, statuses)])
    expect(r.explanations.size).toBe(0)
  })

  it('grows a pen that its cards do not fit, downward, and says so', () => {
    // 1000 wide holds three columns; 600 high holds two rows of 269 plus the gap.
    const routing = board()
    const seven = Array.from({ length: 7 }, (_, i) => t(`t${i}`, ['backend']))
    const r = resolveBoard(seven, routing, {}, statuses, priorities)
    const extent = r.pens.get('backend')!
    expect(extent).toEqual({ count: 7, height: penHeight(1000, 7), overflow: true })
    expect(extent.height).toBe(LANE_GAP + 3 * ROW_PITCH)
    const ys = seven.map(x => r.positions.get(x.id)!.y)
    expect(Math.max(...ys)).toBe(800 + LANE_GAP + 2 * ROW_PITCH)
    // The third column is where a 1000-wide pen puts its third card.
    expect(r.positions.get('t2')).toEqual({ x: LANE_GAP + 2 * (LANE_W + LANE_GAP), y: 800 + LANE_GAP })
    expect(r.pens.get('fe')).toEqual({ count: 0, height: 600, overflow: false })
  })

  it('packs a pen by status, then the more urgent first, then ID, so filing a ticket inserts', () => {
    const routing = board()
    const before = [t('c', ['backend'], 'ready', 'normal'), t('a', ['backend'], 'done'), t('b', ['backend'], 'ready', 'urgent')]
    const first = resolveBoard(before, routing, {}, statuses, priorities)
    const slot = (r: typeof first, id: string) => r.positions.get(id)!
    // ready before done; within ready, urgent b before normal c.
    expect([slot(first, 'b'), slot(first, 'c'), slot(first, 'a')].map(p => p.x)).toEqual([LANE_GAP, LANE_GAP + LANE_W + LANE_GAP, LANE_GAP + 2 * (LANE_W + LANE_GAP)])
    // A new done ticket sorts after a; nothing before it moves.
    const after = resolveBoard([...before, t('d', ['backend'], 'done')], routing, {}, statuses, priorities)
    for (const id of ['a', 'b', 'c']) expect(slot(after, id)).toEqual(slot(first, id))
    expect(slot(after, 'd')).toEqual({ x: LANE_GAP, y: 800 + LANE_GAP + ROW_PITCH })
  })

  it('treats an unknown status or priority as last', () => {
    const r = resolveBoard([t('a', ['backend'], 'weird', 'whatever'), t('b', ['backend'], 'archived', 'low')], board(), {}, statuses, priorities)
    expect(r.positions.get('b')!.x).toBeLessThan(r.positions.get('a')!.x)
  })
})

describe('explain', () => {
  it('reports the missing labels in the rule order and skips a rule naming no pen', () => {
    const routing = board()
    routing.ruleOrder = ['ghost', ...routing.ruleOrder]
    const e = explain(routing, t('a', ['bug']), false)
    expect(e.candidates.map(c => [c.pen, c.order, [...c.missingLabels], [...c.failed], c.outcome])).toEqual([
      ['fe', 1, ['frontend'], ['labels'], 'no-match'],
      ['fe-bugs', 2, ['frontend'], ['labels'], 'no-match'],
      ['backend', 3, ['backend'], ['labels'], 'no-match'],
    ])
    expect(e.destination).toEqual({ kind: 'inbox' })
  })

  it('carries the pen\'s whole rule on every candidate, so a reader needs nothing else', () => {
    const match = rule({ status: ['ready'], type: ['bug'] })
    const e = explain(one(match), ticket({ type: 'bug' }), false)
    expect(e.candidates).toEqual([{ pen: 'p', order: 0, match, missingLabels: [], failed: [], outcome: 'winner' }])
  })
})

// One case per field and one per way the fields combine, because this is the
// half that has to keep agreeing with layout.Match.Failures in Go.
describe('match fields', () => {
  it.each<[string, Match, RuleTicket, RuleTicket]>([
    ['status', rule({ status: ['ready'] }), ticket({ status: 'ready' }), ticket({ status: 'draft' })],
    ['type', rule({ type: ['bug'] }), ticket({ type: 'bug' }), ticket({ type: 'task' })],
    ['parent', rule({ parent: ['TKT-1'] }), ticket({ parent: 'TKT-1' }), ticket({ parent: 'TKT-2' })],
    ['labels', rule({ labels: ['ui'] }), ticket({ labels: ['ui'] }), ticket({ labels: ['api'] })],
  ])('tests %s and fails a ticket that does not satisfy it', (name, match, matching, other) => {
    expect(failures(match, matching)).toEqual({ missingLabels: [], failed: [] })
    expect(failures(match, other).failed).toEqual([name])
    expect(explain(one(match), matching, false).destination).toEqual({ kind: 'pen', id: 'p' })
    expect(explain(one(match), other, false).destination).toEqual({ kind: 'inbox' })
  })

  it('takes a ticket holding no type or parent only where the rule does not test the field', () => {
    const none = ticket({})
    expect(failures(rule({ status: ['ready'] }), none).failed).toEqual([])
    expect(failures(rule({ type: ['task'] }), none).failed).toEqual(['type'])
    expect(failures(rule({ parent: ['TKT-1'] }), none).failed).toEqual(['parent'])
  })

  it('disjoins within status, type and parent: any listed value satisfies the field', () => {
    const match = rule({ status: ['ready', 'blocked'] })
    for (const status of ['ready', 'blocked']) expect(failures(match, ticket({ status })).failed).toEqual([])
    expect(failures(match, ticket({ status: 'draft' })).failed).toEqual(['status'])
    expect(failures(rule({ type: ['bug', 'chore'] }), ticket({ type: 'chore' })).failed).toEqual([])
    expect(failures(rule({ parent: ['TKT-1', 'TKT-2'] }), ticket({ parent: 'TKT-2' })).failed).toEqual([])
  })

  it('conjoins labels within the field and conjoins the fields with each other', () => {
    const labels = rule({ labels: ['ui', 'bug'] })
    expect(failures(labels, ticket({ labels: ['ui'] }))).toEqual({ missingLabels: ['bug'], failed: ['labels'] })
    expect(failures(labels, ticket({ labels: ['bug', 'ui', 'extra'] })).failed).toEqual([])
    const both = rule({ labels: ['ui'], status: ['ready'], type: ['bug'], parent: ['TKT-1'] })
    expect(failures(both, ticket({ labels: ['ui'], status: 'ready', type: 'bug', parent: 'TKT-1' })).failed).toEqual([])
    // Every field is reported, in the order labels, status, type, parent.
    expect(failures(both, ticket({ labels: [], status: 'draft', type: 'task', parent: 'TKT-2' }))).toEqual({
      missingLabels: ['ui'], failed: ['labels', 'status', 'type', 'parent'],
    })
  })
})

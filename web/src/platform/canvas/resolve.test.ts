import { describe, expect, it } from 'vitest'
import { autoPlace, LANE_GAP, LANE_W, ROW_PITCH } from './geometry'
import { explain, penHeight, resolveBoard, type RuleTicket } from './resolve'
import type { Routing } from '../tickets/types'

const statuses = ['draft', 'ready', 'in-progress', 'blocked', 'review', 'done', 'archived']
const priorities = ['low', 'normal', 'high', 'urgent']
const pen = (over: Partial<Routing['pens'][string]> = {}) => ({
  title: 'Pen', x: 0, y: 0, w: 1000, h: 600, color: '#759bcc', pin: { x: 0, y: 0 }, requiredLabels: ['frontend'], ...over,
})
const board = (): Routing => ({
  pens: {
    fe: pen({ title: 'Frontend', requiredLabels: ['frontend'] }),
    'fe-bugs': pen({ title: 'Frontend bugs', x: 1200, requiredLabels: ['frontend', 'bug'] }),
    backend: pen({ title: 'Backend', y: 800, requiredLabels: ['backend'] }),
  },
  ruleOrder: ['fe', 'fe-bugs', 'backend'],
  inbox: { x: -400, y: 0 },
})
const t = (id: string, labels: string[], status = 'ready', priority = 'normal'): RuleTicket => ({ id, labels, status, priority })

describe('resolveBoard', () => {
  it('places an unpinned card by the first pen in ruleOrder whose labels it carries', () => {
    const r = resolveBoard([t('a', ['frontend', 'bug'])], board(), {}, statuses, priorities)
    expect(r.ruled).toBe(true)
    // fe-bugs is the closer fit and loses, because the order is the contract.
    expect(r.explanations.get('a')?.destination).toEqual({ kind: 'pen', id: 'fe' })
    expect(r.explanations.get('a')?.candidates.map(c => c.outcome)).toEqual(['winner', 'later-rule', 'missing-labels'])
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
    expect(r.positions.get('a')).toEqual({ x: -400, y: 0 })
    expect(r.positions.get('b')).toEqual({ x: -400, y: ROW_PITCH })
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
    expect(e.candidates.map(c => [c.pen, c.order, [...c.missing], c.outcome])).toEqual([
      ['fe', 1, ['frontend'], 'missing-labels'],
      ['fe-bugs', 2, ['frontend'], 'missing-labels'],
      ['backend', 3, ['backend'], 'missing-labels'],
    ])
    expect(e.destination).toEqual({ kind: 'inbox' })
  })
})

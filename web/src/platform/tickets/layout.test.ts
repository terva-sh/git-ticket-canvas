import { describe, expect, it } from 'vitest'
import { normalizeLayout, normalizeRouting, SCHEMA } from './layout'
import type { Board, Pen } from './types'

// The normalizer is the one place a board's rules are read, and it has to
// read both spellings of one rule: `match` at schema 4, `requiredLabels` at
// schema 3, which is `match.labels` and always was. The backend refuses a pen
// carrying both or neither, and a spelling its schema does not allow; this
// mirrors those refusals, per git-ticket layout/pens.go.
const geometry = { title: 'Frontend', x: 0, y: 0, w: 500, h: 300, color: '#759bcc', pin: { x: 20, y: 30 } }
const wide = (over: Record<string, unknown> = {}) => ({ ...geometry, match: { labels: ['ui'] }, ...over })
const board = (schema: number, pen: unknown): Board =>
  ({ schema, board: 'default', cards: {}, frames: {}, pens: { p: pen as Pen }, ruleOrder: ['p'], inbox: { x: 0, y: 0 } })
const rule = (over = {}) => ({ labels: [], status: [], type: [], parent: [], ...over })

describe('normalizeRouting', () => {
  it('reads a schema 4 match and fills every field it does not name', () => {
    const routing = normalizeRouting({ pens: { p: wide() }, ruleOrder: ['p'], inbox: { x: 0, y: 0 } })
    expect(routing.pens.p.match).toEqual(rule({ labels: ['ui'] }))
  })

  it('reads all four fields and deduplicates each without trimming or folding case', () => {
    const match = { labels: ['ui', 'UI', 'ui'], status: ['ready', 'blocked'], type: ['bug'], parent: ['TKT-1', 'TKT-1'] }
    const routing = normalizeRouting({ pens: { p: wide({ match }) }, ruleOrder: ['p'], inbox: { x: 0, y: 0 } })
    expect(routing.pens.p.match).toEqual({ labels: ['ui', 'UI'], status: ['ready', 'blocked'], type: ['bug'], parent: ['TKT-1'] })
  })

  it('reads a schema 3 requiredLabels as match.labels', () => {
    const legacy = { ...geometry, requiredLabels: ['ui', 'bug'] }
    const routing = normalizeRouting({ pens: { p: legacy }, ruleOrder: ['p'], inbox: { x: 0, y: 0 } }, 3)
    expect(routing.pens.p.match).toEqual(rule({ labels: ['ui', 'bug'] }))
  })

  it.each([
    ['both spellings', SCHEMA, { ...geometry, match: { labels: ['ui'] }, requiredLabels: ['ui'] }],
    ['neither spelling', SCHEMA, { ...geometry }],
    ['match on a schema 3 pen', 3, wide()],
    ['requiredLabels on a schema 4 pen', SCHEMA, { ...geometry, requiredLabels: ['ui'] }],
    ['a rule that tests nothing', SCHEMA, wide({ match: {} })],
    ['every field empty', SCHEMA, wide({ match: { labels: [], status: [], type: [], parent: [] } })],
    ['a null field', SCHEMA, wide({ match: { labels: null } })],
    ['a blank value', SCHEMA, wide({ match: { status: [' '] } })],
    ['a field that is not a list', SCHEMA, wide({ match: { type: 'bug' } })],
    ['an unknown match field', SCHEMA, wide({ match: { labels: ['ui'], future: ['x'] } })],
  ])('refuses %s', (_name, schema, pen) => {
    expect(() => normalizeRouting({ pens: { p: pen }, ruleOrder: ['p'], inbox: { x: 0, y: 0 } }, schema)).toThrow()
  })
})

describe('normalizeLayout', () => {
  it('accepts a schema 4 board and a schema 3 board, and gives the same rule for both', () => {
    const now = normalizeLayout(board(SCHEMA, wide()), 'default')
    const legacy = normalizeLayout(board(3, { ...geometry, requiredLabels: ['ui'] }), 'default')
    expect(now.pens.p.match).toEqual(rule({ labels: ['ui'] }))
    expect(legacy.pens.p.match).toEqual(now.pens.p.match)
  })

  it('refuses a schema 3 board whose pen carries match, and a schema past this one', () => {
    expect(() => normalizeLayout(board(3, wide()), 'default')).toThrow()
    expect(() => normalizeLayout(board(SCHEMA + 1, wide()), 'default')).toThrow()
  })

  it('leaves a schema 1 or 2 board with no routing at all', () => {
    const empty = normalizeLayout({ schema: 2, board: 'default', cards: {} }, 'default')
    expect(empty).toMatchObject({ pens: {}, ruleOrder: [], inbox: { x: 0, y: 0 } })
  })
})

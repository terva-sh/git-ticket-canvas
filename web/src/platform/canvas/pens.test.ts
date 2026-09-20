import { describe, expect, it } from 'vitest'
import { addPen, canonical, moveRule, overlaps, penIdFor, preview, problems, removePen, sameRouting, setInbox, updatePen } from './pens'
import type { Pen, Routing, Ticket } from '../tickets/types'

function ticket(id: string, labels: string[], status = 'ready'): Ticket {
  return { id, short: id, title: id, status, type: 'task', priority: 'normal', labels, assignees: [], dependencies: [],
    blocksOn: 'none', references: [], updatedAt: '' } as unknown as Ticket
}
const pen = (over: Partial<Pen> = {}, match: Partial<Pen['match']> = {}): Pen => ({
  title: 'Frontend', x: 0, y: 0, w: 1000, h: 300, color: '#759bcc', pin: { x: 0, y: 0 },
  match: { labels: ['frontend'], status: [], type: [], parent: [], ...match }, ...over })
const board: Routing = { pens: { fe: pen(), done: pen({ title: 'Done' }, { labels: [], status: ['done'] }) }, ruleOrder: ['fe', 'done'], inbox: { x: -400, y: 0 } }
const tickets = [ticket('a', ['frontend']), ticket('b', ['frontend'], 'done'), ticket('c', ['docs']), ticket('held', ['frontend'])]

describe('operations', () => {
  it('never share records with the routing they came from', () => {
    const next = updatePen(board, 'fe', { ...board.pens.fe, title: 'Renamed' })
    expect(board.pens.fe.title).toBe('Frontend')
    expect(next.pens.fe.title).toBe('Renamed')
    next.pens.fe.match.labels.push('x')
    expect(board.pens.fe.match.labels).toEqual(['frontend'])
  })
  it('add appends to the order, remove takes the pen out of it', () => {
    const added = addPen(board, 'bugs', pen({ title: 'Bugs' }, { labels: ['bug'] }))
    expect(added.ruleOrder).toEqual(['fe', 'done', 'bugs'])
    const removed = removePen(added, 'fe')
    expect(removed.ruleOrder).toEqual(['done', 'bugs'])
    expect(removed.pens.fe).toBeUndefined()
  })
  it('moves a rule by places and clamps at the ends', () => {
    expect(moveRule(board, 'done', -1).ruleOrder).toEqual(['done', 'fe'])
    expect(moveRule(board, 'done', -5).ruleOrder).toEqual(['done', 'fe'])
    expect(moveRule(board, 'fe', 9).ruleOrder).toEqual(['done', 'fe'])
    expect(moveRule(board, 'missing', 1).ruleOrder).toEqual(['fe', 'done'])
  })
  it('sets the inbox', () => {
    expect(setInbox(board, { x: 5, y: 6 }).inbox).toEqual({ x: 5, y: 6 })
  })
  it('derives an ID from a title and steps past taken ones', () => {
    expect(penIdFor('Frontend bugs!', [])).toBe('frontend-bugs')
    expect(penIdFor('Frontend bugs', ['frontend-bugs'])).toBe('frontend-bugs-2')
    expect(penIdFor('???', [])).toBe('pen')
  })
})

describe('validity', () => {
  it('accepts the board the CLI would accept', () => { expect(problems(board)).toEqual([]) })
  it('refuses an empty rule with the inbox named as the fallback', () => {
    const r = updatePen(board, 'fe', pen({}, { labels: [] }))
    expect(problems(r).map(p => p.field)).toEqual(['match'])
    expect(problems(r)[0].message).toContain('Unmatched automatic cards go to Inbox')
  })
  it('refuses what the server would: id, title, geometry, colour, parent grammar, order', () => {
    const bad: Routing = { pens: { 'bad id': pen({ title: '', w: 0, color: '#000000' }, { parent: ['nope'] }) }, ruleOrder: ['bad id', 'ghost'], inbox: { x: NaN, y: 0 } }
    expect(problems(bad).map(p => p.field).sort()).toEqual(['color', 'id', 'inbox', 'order', 'parent', 'region', 'title'])
  })
  it('compares routings the way the server writes them', () => {
    const a = updatePen(board, 'fe', pen({}, { labels: ['frontend', 'frontend'] }))
    expect(sameRouting(a, board)).toBe(true)
    expect(canonical(a).pens.fe.match.labels).toEqual(['frontend'])
    expect(sameRouting(moveRule(board, 'done', -1), board)).toBe(false)
  })
})

describe('preview', () => {
  const cards = { held: { x: 1, y: 1 } }
  it('lists the automatic cards that change destination, and the pinned ones apart', () => {
    const after = updatePen(board, 'fe', pen({}, { labels: ['docs'] }))
    const p = preview(board, after, tickets, cards)
    // b is frontend and done: the first rule took it before, the second takes it after.
    expect(p.moves).toEqual([{ id: 'a', from: 'fe', to: 'inbox' }, { id: 'b', from: 'fe', to: 'done' }, { id: 'c', from: 'inbox', to: 'fe' }])
    expect(p.pinnedWouldMove).toEqual([{ id: 'held', from: 'fe', to: 'inbox' }])
    expect(p.counts).toEqual({ fe: { before: 2, after: 1 }, done: { before: 0, after: 1 } })
    expect(p.inbox).toEqual({ before: 1, after: 1 })
  })
  it('counts a removed pen nowhere and sends its cards to the next rule or the inbox', () => {
    const p = preview(board, removePen(board, 'fe'), tickets, cards)
    expect(p.moves).toEqual([{ id: 'a', from: 'fe', to: 'inbox' }, { id: 'b', from: 'fe', to: 'done' }])
    expect(Object.keys(p.counts)).toEqual(['done'])
  })
  it('names the cards an earlier rule took from a later one', () => {
    // b is done and frontend: fe (rule 1) takes it, done (rule 2) also matches.
    expect(overlaps(board, tickets, cards)).toEqual([{ pen: 'done', takenBy: 'fe', ids: ['b'] }])
    expect(overlaps(moveRule(board, 'done', -1), tickets, cards)).toEqual([{ pen: 'fe', takenBy: 'done', ids: ['b'] }])
  })
})

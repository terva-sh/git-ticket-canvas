import { describe, expect, it } from 'vitest'
import { closingCycle, cycleFinder, type RelationKind, type RelationTicket } from './relations'

/** A store written as `id: deps` with optional `^parent` and `*` for a ticket
 * that blocks on its children, so each row reads as the graph it builds:
 * `B: C ^E` is B, depending on C, with E as its parent. */
function store(...rows: string[]): Map<string, RelationTicket> {
  const tickets = new Map<string, RelationTicket>()
  for (const row of rows) {
    const [head, rest = ''] = row.split(':')
    const id = head.replace('*', '').trim()
    const words = rest.trim().split(/\s+/).filter(Boolean)
    tickets.set(id, {
      id,
      dependencies: words.filter(word => !word.startsWith('^')),
      parent: words.find(word => word.startsWith('^'))?.slice(1),
      blocksOn: head.includes('*') ? 'children' : 'none',
    })
  }
  return tickets
}

interface Row {
  name: string
  tickets: Map<string, RelationTicket>
  kind: RelationKind
  ticket: string
  target: string
  cycle: string[] | null
}

const rows: Row[] = [
  { name: 'a ticket depending on itself', tickets: store('A:'), kind: 'dependency', ticket: 'A', target: 'A', cycle: ['A'] },
  { name: 'a ticket as its own parent', tickets: store('A:'), kind: 'parent', ticket: 'A', target: 'A', cycle: ['A'] },
  { name: 'an unrelated dependency', tickets: store('A:', 'B:'), kind: 'dependency', ticket: 'A', target: 'B', cycle: null },
  { name: 'a dependency the other way round from one that exists',
    tickets: store('A:', 'B: A'), kind: 'dependency', ticket: 'A', target: 'B', cycle: ['A', 'B'] },
  { name: 'a cycle through three tickets',
    tickets: store('A:', 'B: C', 'C: A'), kind: 'dependency', ticket: 'A', target: 'B', cycle: ['A', 'B', 'C'] },
  { name: 'a diamond, which shares a dependency and is not a cycle',
    tickets: store('A: B C', 'B: D', 'C: D', 'D:'), kind: 'dependency', ticket: 'B', target: 'C', cycle: null },
  { name: 'the shortest of two loops',
    tickets: store('A:', 'B: C E', 'C: D', 'D: A', 'E: A'), kind: 'dependency', ticket: 'A', target: 'B', cycle: ['A', 'B', 'E'] },
  { name: 'a loop through a done ticket, which still counts',
    tickets: store('A:', 'B: DONE', 'DONE: A'), kind: 'dependency', ticket: 'A', target: 'B', cycle: ['A', 'B', 'DONE'] },
  { name: 'a dependency on a done ticket that closes nothing',
    tickets: store('A:', 'DONE:'), kind: 'dependency', ticket: 'A', target: 'DONE', cycle: null },
  { name: 'an edge through a ticket not in the store',
    tickets: store('A:', 'B: GONE', 'C: A'), kind: 'dependency', ticket: 'A', target: 'B', cycle: null },
  { name: 'a target not in the store', tickets: store('A:'), kind: 'dependency', ticket: 'A', target: 'GONE', cycle: null },
  { name: 'a parent chain that leads back to the ticket',
    tickets: store('A:', 'B: ^C', 'C: ^A'), kind: 'parent', ticket: 'A', target: 'B', cycle: ['A', 'B', 'C'] },
  { name: 'a parent that is already a child', tickets: store('A:', 'B: ^A'), kind: 'parent', ticket: 'A', target: 'B', cycle: ['A', 'B'] },
  { name: 'a parent chain that ends without meeting the ticket',
    tickets: store('A:', 'B: ^C', 'C:'), kind: 'parent', ticket: 'A', target: 'B', cycle: null },
  { name: 'a parent chain that already loops elsewhere, which this edge does not close',
    tickets: store('A:', 'B: ^C', 'C: ^B'), kind: 'parent', ticket: 'A', target: 'B', cycle: null },
  { name: 'a parent the ticket waits on, when the parent does not block on children',
    tickets: store('A: E', 'E:'), kind: 'parent', ticket: 'A', target: 'E', cycle: null },
  { name: 'a parent that blocks on children and that the ticket waits on',
    tickets: store('A: E', '*E:'), kind: 'parent', ticket: 'A', target: 'E', cycle: ['A', 'E'] },
  { name: 'a parent that blocks on children and that the ticket waits on through another',
    tickets: store('T: X', 'X: E', '*E:'), kind: 'parent', ticket: 'T', target: 'E', cycle: ['T', 'X', 'E'] },
  { name: 'a parent that blocks on children and waits on the ticket, which is the safe direction',
    tickets: store('A:', '*E: A'), kind: 'parent', ticket: 'A', target: 'E', cycle: null },
  { name: 'a child depending on the epic that blocks on it',
    tickets: store('*E:', 'C: ^E'), kind: 'dependency', ticket: 'C', target: 'E', cycle: ['C', 'E'] },
  { name: 'a blocking loop through a grandchild',
    tickets: store('*E:', '*F: ^E', 'G: ^F'), kind: 'dependency', ticket: 'G', target: 'E', cycle: ['G', 'E', 'F'] },
  { name: 'a blocking loop that alternates child and dependency edges',
    tickets: store('*E:', 'C: ^E X', 'X:'), kind: 'dependency', ticket: 'X', target: 'E', cycle: ['X', 'E', 'C'] },
  { name: 'a child of an epic that does not block on children',
    tickets: store('E:', 'C: ^E'), kind: 'dependency', ticket: 'C', target: 'E', cycle: null },
  { name: 'a parent whose chain reaches the ticket through a done ancestor',
    tickets: store('A:', 'B: ^DONE', 'DONE: ^A'), kind: 'parent', ticket: 'A', target: 'B', cycle: ['A', 'B', 'DONE'] },
]

describe('Whether a new relationship closes a cycle', () => {
  it.each(rows)('$name', ({ tickets, kind, ticket, target, cycle }) => {
    expect(closingCycle(tickets, kind, ticket, target)).toEqual(cycle)
  })

  it('names tickets so that each one leads to the next and the last leads back', () => {
    // Checked independently of the table, against the edges themselves, so a
    // reordering bug cannot pass by agreeing with a wrong expectation.
    const tickets = store('A:', 'B: C', 'C: D', 'D: A')
    const cycle = closingCycle(tickets, 'dependency', 'A', 'B')!
    const leads = (from: string, to: string) => from === 'A' ? to === 'B' : tickets.get(from)!.dependencies.includes(to)
    cycle.forEach((id, i) => expect(leads(id, cycle[(i + 1) % cycle.length])).toBe(true))
  })

  it('answers many edges from one finder the same as one at a time', () => {
    const tickets = store('A: B', 'B: C', 'C:', '*E:', 'F: ^E', 'G: ^F')
    const finder = cycleFinder(tickets)
    for (const kind of ['dependency', 'parent'] as const) {
      for (const ticket of tickets.keys()) for (const target of tickets.keys()) {
        expect(finder(kind, ticket, target)).toEqual(closingCycle(tickets, kind, ticket, target))
      }
    }
  })

  it('reads nothing but the relationship fields, so a partial ticket is enough', () => {
    const tickets = new Map<string, RelationTicket>([
      ['A', { id: 'A', dependencies: [], blocksOn: 'none' }],
      ['B', { id: 'B', dependencies: ['A'], blocksOn: 'none' }],
    ])
    expect(closingCycle(tickets, 'dependency', 'A', 'B')).toEqual(['A', 'B'])
  })
})

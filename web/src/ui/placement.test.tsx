// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlacementSection, placementLines, type PlacementProps } from './Placement'
import { explain } from '../platform/canvas/resolve'
import type { Pens, Ticket } from '../platform/tickets/types'

function ticket(id: string, labels: string[], status = 'ready', parent?: string): Ticket {
  return { id, short: id, title: id, status, type: 'task', priority: 'normal', labels, parent, assignees: [], dependencies: [],
    blocksOn: 'none', references: [], updatedAt: '2026-09-20T00:00:00Z' } as unknown as Ticket
}
const pens: Pens = {
  done: { title: 'Done', x: 0, y: 2400, w: 2400, h: 1200, color: '#888', pin: { x: 0, y: 2400 },
    match: { labels: [], status: ['done', 'archived'], type: [], parent: [] } },
  fe: { title: 'Frontend', x: 0, y: 0, w: 1000, h: 300, color: '#759bcc', pin: { x: 0, y: 0 },
    match: { labels: ['frontend', 'bug'], status: [], type: [], parent: [] } },
  all: { title: 'Everything', x: 0, y: 900, w: 1000, h: 300, color: '#aaa', pin: { x: 0, y: 900 },
    match: { labels: ['frontend'], status: [], type: [], parent: [] } },
}
const routing = { pens, ruleOrder: ['done', 'fe', 'all'], inbox: { x: -1400, y: 0 } }

let root: HTMLDivElement
beforeEach(() => { root = document.createElement('div'); document.body.append(root) })
afterEach(() => { act(() => render(null, root)); root.remove(); vi.restoreAllMocks() })

function show(t: Ticket, over: Partial<PlacementProps> = {}) {
  const onRelease = vi.fn()
  const pinned = over.pinned ?? null
  const props: PlacementProps = { ticket: t, pinned, explanation: explain(routing, t, !!pinned), pens, inbox: routing.inbox,
    readOnly: false, onRelease, ...over }
  act(() => render(<PlacementSection {...props} />, root))
  return { onRelease, button: root.querySelector<HTMLButtonElement>('button[data-return-automatic]')! }
}
const lines = () => [...root.querySelectorAll('.placement-routing li')].map(li => li.textContent)

// The words are the CLI's words, so that somebody reading the inspector and
// somebody reading `git ticket canvas explain` can compare notes exactly.
it('explains a routed card the way git ticket canvas explain does', () => {
  show(ticket('a', ['frontend', 'bug']))
  expect(root.querySelector('.placement-verdict')!.textContent).toBe('automatic: the canvas places it by the rules below')
  expect(lines()).toEqual([
    'goes to pen fe (Frontend): labels frontend, bug',
    'not done (rule 1): status is ready, rule wants done or archived',
    'not all (rule 3): matches, but an earlier rule took it',
  ])
})

it('names every field a rule failed on, in the resolver order', () => {
  const t = ticket('b', ['docs'], 'ready', 'TKT-01M2ND0S8N5Y8V0HQFRCBKMXE3')
  const strict: Pens = { one: { ...pens.fe, match: { labels: ['frontend'], status: ['done'], type: ['epic'], parent: ['TKT-X'] } } }
  const words = placementLines(explain({ pens: strict, ruleOrder: ['one'], inbox: routing.inbox }, t, false), t, null, strict, routing.inbox)
  expect(words.destination).toBe('goes to the inbox (-1400, 0): no rule matched')
  expect(words.passedOver).toEqual(['not one (rule 1): missing labels frontend; status is ready, rule wants done; type is task, rule wants epic; parent is TKT-01M2ND0S8N5Y8V0HQFRCBKMXE3, rule wants TKT-X'])
})

it('says a pinned card is where somebody put it, and still says where the rules would send it', () => {
  const { button } = show(ticket('c', ['frontend', 'bug']), { pinned: { x: 120, y: 40.5 } })
  expect(root.querySelector('.placement-verdict')!.textContent).toBe('pinned at (120, 40.5); routing does not apply')
  expect(lines()[0]).toBe('goes to pen fe (Frontend): labels frontend, bug')
  expect(button.disabled).toBe(false)
})

it('says a board with no pens places in status lanes, with nothing to release', () => {
  const t = ticket('d', [])
  const { button } = show(t, { explanation: explain({ pens: {}, ruleOrder: [], inbox: { x: 0, y: 0 } }, t, false), pens: {} })
  expect(root.querySelector('.placement-verdict')!.textContent).toBe('automatic: the board has no pens, so the canvas places it in status lanes')
  expect(root.querySelector('.placement-routing')).toBeNull()
  expect(button.disabled).toBe(true)
})

it('hands the card back to the rules through the canvas, and only when it is pinned', () => {
  const { onRelease, button } = show(ticket('e', []), { pinned: { x: 1, y: 2 } })
  act(() => button.click())
  expect(onRelease).toHaveBeenCalledWith('e')
  const automatic = show(ticket('f', []))
  expect(automatic.button.disabled).toBe(true)
})

// A served canvas is read-only: the explanation is the point of showing it
// to more people, and the control has to be visibly there and visibly off.
it('keeps the explanation and disables the control on a read-only canvas', () => {
  const { onRelease, button } = show(ticket('g', ['frontend']), { pinned: { x: 1, y: 2 }, readOnly: true })
  expect(lines()[0]).toBe('goes to pen all (Everything): labels frontend')
  expect(button.disabled).toBe(true)
  expect(root.textContent).toContain('Read-only. Placement cannot be changed.')
  act(() => button.click())
  expect(onRelease).not.toHaveBeenCalled()
})

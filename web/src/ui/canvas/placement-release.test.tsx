// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CardView } from './CardView'
import type { Ticket } from '../../platform/tickets/types'

let root: HTMLDivElement
beforeEach(() => { root = document.createElement('div'); document.body.append(root) })
afterEach(() => { act(() => render(null, root)); root.remove() })

function ticket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: 'TKT-01M2NJZ6CTYYST3Z4XB20G3W4D', short: 'TKT-01M2NJ', title: 'A ticket', status: 'ready', type: 'task',
    priority: 'normal', labels: [], assignees: [], dependencies: [], blocksOn: 'none',
    references: [], updatedAt: '2026-09-16T00:00:00Z', ...over,
  } as Ticket
}

function show(props: Partial<Parameters<typeof CardView>[0]> = {}) {
  act(() => render(<CardView ticket={ticket()} x={0} y={0} z={1} pinned selected={false} target={false}
    dimmed={false} register={() => () => {}} {...props} />, root))
  return root.querySelector<HTMLElement>('.card-placement')!
}

// Dragging a card was a one-way door: it took a saved position and nothing in
// the canvas gave it back. The label that reports the state is where somebody
// looks to change it.
it('offers the placement label as the way back to automatic', () => {
  const onRelease = vi.fn()
  const control = show({ onRelease })
  expect(control.tagName).toBe('BUTTON')
  // The word does not change, because the head should not reflow under the
  // pointer. What it does is in the accessible name.
  expect(control.textContent).toBe('Manual')
  expect(control.getAttribute('aria-label')).toContain('automatic placement')
  act(() => control.click())
  expect(onRelease).toHaveBeenCalledWith('TKT-01M2NJZ6CTYYST3Z4XB20G3W4D')
})

it('offers nothing to press on a card the rules already place', () => {
  const control = show({ pinned: false, onRelease: vi.fn() })
  expect(control.tagName).toBe('SPAN')
  expect(control.textContent).toBe('Automatic')
})

// A read-only canvas passes no handler at all, so the label goes back to being
// a label. A disabled button would advertise an operation that is not on offer.
it('offers nothing to press when the canvas cannot be written to', () => {
  const control = show({ onRelease: undefined })
  expect(control.tagName).toBe('SPAN')
  expect(control.textContent).toBe('Manual')
})

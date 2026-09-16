// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { CardView } from './CardView'
import type { Ticket } from '../../platform/tickets/types'

let root: HTMLDivElement
beforeEach(() => { root = document.createElement('div'); document.body.append(root) })
afterEach(() => { act(() => render(null, root)); root.remove() })

function ticket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: 'TKT-01M2ND1RNXB8941M21MRZRJDN2', title: 'A ticket', status: 'ready', type: 'task',
    priority: 'normal', labels: [], assignees: [], dependencies: [], blocksOn: 'none',
    references: [], updatedAt: '2026-09-16T00:00:00Z', ...over,
  } as Ticket
}

function show(t: Ticket) {
  act(() => render(<CardView ticket={t} x={0} y={0} z={1} pinned selected={false} target={false} dimmed={false} register={() => () => {}} />, root))
  return root.querySelector<HTMLElement>('.card')!
}

// The note this came from: done tickets at the same visibility as everything
// else make the board harder to glance over.
it('lets settled work recede without hiding it', () => {
  for (const status of ['done', 'archived'] as const) {
    const card = show(ticket({ status }))
    expect(card.classList.contains(status)).toBe(true)
    // Still rendered. The history is why a board is trustworthy, and a board
    // that forgets what was finished cannot be read backwards.
    expect(card.querySelector('.card-title')!.textContent).toBe('A ticket')
  }
})

// Weight follows actionability, not lifecycle, so a finished ticket must not
// pick up the treatments meant for work somebody could start.
it('gives settled work none of the actionable treatments', () => {
  const card = show(ticket({ status: 'done', readiness: { ready: true, blocked: false, missing: [] } } as Partial<Ticket>))
  expect(card.classList.contains('startable')).toBe(false)
  expect(card.classList.contains('blocked-card')).toBe(false)
})

it('marks what could be picked up now', () => {
  const card = show(ticket({ status: 'ready', readiness: { ready: true, blocked: false, missing: [] } } as Partial<Ticket>))
  expect(card.classList.contains('startable')).toBe(true)
})

it('marks what is waiting, and says what it waits on', () => {
  const card = show(ticket({
    status: 'blocked',
    // The count comes from readiness, which is what the server resolved, not
    // from the raw dependency list.
    readiness: { ready: false, blocked: true, missing: [],
      blocking: ['TKT-01M2ND1RH33T89QZ7JBA0YC1AZ', 'TKT-01M2ND1RJAGTH8QBF1QK79XPC0'] },
  } as Partial<Ticket>))
  expect(card.classList.contains('blocked-card')).toBe(true)
  expect(card.classList.contains('startable')).toBe(false)
  expect(card.querySelector('.blocked')!.textContent).toContain('Blocked by')
})

// On a canvas serving several people, a card somebody else holds is a
// different card from an unclaimed one and nothing said so.
it('says who holds a claimed card', () => {
  const card = show(ticket({ claim: { actor: 'human:sothr', expired: false } } as Partial<Ticket>))
  expect(card.classList.contains('claimed')).toBe(true)
  expect(card.querySelector('.held')!.textContent).toBe('human:sothr')
})

// A claim is advisory and reserves nothing, so an expired one is not a claim
// and must not go on telling people the work is taken.
it('does not treat an expired claim as a claim', () => {
  const card = show(ticket({ claim: { actor: 'human:sothr', expired: true } } as Partial<Ticket>))
  expect(card.classList.contains('claimed')).toBe(false)
  expect(root.querySelector('.held')).toBeNull()
})

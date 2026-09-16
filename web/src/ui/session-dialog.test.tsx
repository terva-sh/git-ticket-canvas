// @vitest-environment jsdom
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SessionDialog } from './SessionDialog'
import { Toolbar, type ToolbarProps } from './Toolbar'
import type { ActorResponse, SessionResponse } from '../platform/tickets/types'

let root: HTMLDivElement
beforeEach(() => { root = document.createElement('div'); document.body.append(root) })
afterEach(() => { act(() => render(null, root)); root.remove(); vi.restoreAllMocks() })

function element<T extends HTMLElement>(selector: string) { return root.querySelector<T>(selector)! }

const signedIn: SessionResponse = {
  authenticated: true, subject: 'sub-1', name: 'Drew Short', email: 'drew@example.com',
  groups: ['Brokkr Ticket Ledger Admin', 'Everyone'],
  granted: ['Brokkr Ticket Ledger Admin'],
  wouldGrant: [],
  logout: '/auth/logout',
}
const suggested: ActorResponse = { actor: 'human:drew', chosen: false, declared: [], enforced: false }

function show(props: Partial<Parameters<typeof SessionDialog>[0]> = {}) {
  act(() => render(<SessionDialog session={signedIn} store="ledger" actor={suggested}
    onActor={() => {}} onClose={() => {}} {...props} />, root))
}

function groupRows() {
  // The leading list only. The collapsed one reuses the class deliberately, so
  // the two render identically.
  return [...root.querySelectorAll<HTMLElement>('.session-matched > li')]
    .map(row => [row.querySelector('.session-group-name')!.textContent, row.classList.contains('granted')])
}

// A group that arrives and grants nothing looks identical to a group the
// provider never sent. The dialog exists mostly to tell those apart.
it('leads with the groups that grant, and hides the rest behind a summary', () => {
  show()
  // Only the granting group is in the leading list.
  expect(groupRows()).toEqual([['Brokkr Ticket Ledger Admin', true]])
  // The rest are kept, collapsed, because comparing them is the diagnostic.
  const others = element<HTMLDetailsElement>('.session-others')
  expect(others.open).toBe(false)
  expect(others.querySelector('summary')!.textContent).toContain('1 other group')
  expect([...others.querySelectorAll('.session-group-name')].map(n => n.textContent)).toEqual(['Everyone'])
})

// The half a person's own group list cannot show. An unmatched name beside
// their own is how a misspelling is found without reading a config file.
it('names a group that would grant but did not match', () => {
  show({ session: { ...signedIn, wouldGrant: ['Brokkr Ticket Ledger Userss'] } })
  const rows = [...root.querySelectorAll('.session-matched > li')]
  expect(rows.map(r => r.querySelector('.session-group-name')?.textContent))
    .toEqual(['Brokkr Ticket Ledger Admin', 'Brokkr Ticket Ledger Userss'])
  expect(element('.would-grant').textContent).toContain('you are not in it')
})

it('says plainly when nothing grants', () => {
  show({ session: { ...signedIn, granted: [], wouldGrant: [] } })
  expect(element('.session-none').textContent).toContain('None of your groups')
  expect(element('.session-others summary').textContent).toContain('2 other groups')
})

// The most common misconfiguration there is, so it says what to check rather
// than rendering an empty list.
it('says so when the login carried no groups at all', () => {
  show({ session: { ...signedIn, groups: [], granted: [] } })
  expect(root.querySelector('.session-groups')).toBeNull()
  expect(element('.session-empty').textContent).toContain('groups')
})

it('shows the claims the provider sent', () => {
  show()
  expect(element('.session-who').textContent).toBe('Drew Short')
  expect(element('.session-email').textContent).toBe('drew@example.com')
})

it('offers a way out, which is the only one there is', () => {
  show()
  expect(element<HTMLAnchorElement>('#sessionLogout').getAttribute('href')).toBe('/auth/logout')
})

// TKT-01M2MECN07 built the actor binding and gave it no interface. This is it.
it('shows the actor for this store and says it is only a suggestion', () => {
  show()
  expect(element<HTMLInputElement>('#sessionActor').value).toBe('human:drew')
  expect(element('.session-hint').textContent).toContain('suggestion')
  // Nothing to save until it differs from what the canvas already offers.
  expect(element<HTMLButtonElement>('#sessionActorSave').disabled).toBe(true)
})

it('saves a changed actor', () => {
  const onActor = vi.fn()
  show({ onActor })
  const field = element<HTMLInputElement>('#sessionActor')
  field.value = 'human:someone-else'
  act(() => { field.dispatchEvent(new Event('input', { bubbles: true })) })
  act(() => { element('#sessionActorSave').click() })
  expect(onActor).toHaveBeenCalledWith('human:someone-else')
})

// A refusal is an answer to what was just typed, so it belongs beside the field
// rather than in a toast that outlives the dialog.
it('shows a refusal next to the field', () => {
  show({ actorError: 'that actor id is already bound to somebody else on this store' })
  expect(element('.session-error').textContent).toContain('already bound')
})

it('says when the store enforces its declared actors', () => {
  show({ actor: { actor: '', chosen: false, declared: ['human:sothr'], enforced: true } })
  expect(element('.session-hint').textContent).toContain('only the actor ids it declares')
  expect(root.querySelector('#sessionDeclaredActors option')!.getAttribute('value')).toBe('human:sothr')
})

// A desk canvas has no session, so the control that opens this must not exist.
it('the toolbar offers no account button without a session', () => {
  const props: ToolbarProps = {
    storePath: '/ws/one/.tickets', readOnly: false, boards: ['default'], board: 'default', query: '',
    config: null, filters: new Set<string>(), counts: '0 of 0',
    onQuery: () => {}, onFilter: () => {}, onBoard: () => {}, onNewBoard: () => {},
    onArrange: () => {}, onFit: () => {}, onNew: () => {},
  }
  act(() => render(<Toolbar {...props} />, root))
  expect(root.querySelector('#btnAccount')).toBeNull()

  act(() => render(<Toolbar {...props} account={{ name: 'Drew Short', onOpen: () => {} }} />, root))
  expect(element('#btnAccount').textContent).toBe('Drew Short')
})

import { useEffect, useRef, useState } from 'preact/hooks'
import type { ActorResponse, PersonResponse, SessionResponse } from '../platform/tickets/types'

export interface SessionDialogProps {
  session: SessionResponse
  /** The store being looked at. An actor belongs to one store. */
  store: string
  /** Undefined while the actor is in flight, null where this canvas has none. */
  actor?: ActorResponse | null
  /** A refusal from the last attempt to set an actor, already made readable. */
  actorError?: string
  busy?: boolean
  /** Everybody who has signed in. Undefined while in flight, null where this
   * caller does not administer the canvas or the fetch failed. */
  people?: PersonResponse[] | null
  onActor(actor: string): void
  onClose(): void
}

/** A timestamp as something a person reads, falling back to the raw value
 * rather than inventing one. */
function when(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  const days = Math.floor((Date.now() - at.getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return at.toLocaleDateString()
}

/** What to call somebody when the provider sent no display name. */
function who(session: SessionResponse): string {
  return session.name || session.email || session.subject || 'Signed in'
}

/**
 * Who you are here, why you can see what you can see, what your writes are
 * stamped with, and how to stop being signed in.
 *
 * The four belong together rather than in a settings screen: they are one
 * answer to "who am I on this canvas", and an actor id is a statement about
 * identity rather than a preference about the tool.
 */
export function SessionDialog(p: SessionDialogProps) {
  const [draft, setDraft] = useState(p.actor?.actor || '')
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => { close.current?.focus() }, [])
  // The suggestion arrives after the dialog opens, so the field follows it
  // until somebody types, and never overwrites what they typed.
  const [touched, setTouched] = useState(false)
  useEffect(() => {
    if (!touched && p.actor?.actor) setDraft(p.actor.actor)
  }, [p.actor?.actor, touched])

  const granted = new Set(p.session.granted)
  // Somebody in sixteen groups should not have to read past fourteen that do
  // nothing to find the two that let them in. Lead with what grants, then with
  // what would have, and keep the rest for comparison rather than dropping it:
  // an unmatched-and-unexpected name beside an unmatched-and-expected one is
  // how a typo is spotted.
  const working = p.session.groups.filter(group => granted.has(group))
  const idle = p.session.groups.filter(group => !granted.has(group))
  const changed = !!p.actor && draft.trim() !== '' && draft.trim() !== p.actor.actor

  return <div id="sessionDialog" class="session-dialog" role="dialog" aria-modal="true" aria-label="Your account"
    onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); p.onClose() } }}>
    <div class="session-head">
      <div>
        <strong class="session-who">{who(p.session)}</strong>
        {p.session.email && p.session.name && <span class="session-email">{p.session.email}</span>}
      </div>
      <button type="button" class="tool" id="sessionClose" ref={close} onClick={p.onClose}>Close</button>
    </div>

    <section class="session-section">
      <h2>Groups</h2>
      {p.session.groups.length === 0
        // The most common misconfiguration there is, so it says what to check
        // rather than rendering an empty list and leaving somebody guessing.
        ? <p class="session-empty">Your login carried no groups at all. That is usually a provider
          sending them under a different claim than <code>groups</code>.</p>
        : <ul class="session-groups session-matched">
          {working.map(group => <li key={group} class="granted">
            <span class="session-group-name">{group}</span>
            <span class="session-group-state">grants access</span>
          </li>)}
          {p.session.wouldGrant.map(group => <li key={group} class="would-grant">
            <span class="session-group-name">{group}</span>
            <span class="session-group-state">would grant &mdash; you are not in it</span>
          </li>)}
          {working.length === 0 && p.session.wouldGrant.length === 0 &&
            <li class="session-none"><span>None of your groups grants anything here.</span></li>}
        </ul>}
      {idle.length > 0 && <details class="session-others">
        <summary>{idle.length} other {idle.length === 1 ? 'group' : 'groups'}, granting nothing here</summary>
        <ul class="session-groups">
          {idle.map(group => <li key={group}>
            <span class="session-group-name">{group}</span>
          </li>)}
        </ul>
      </details>}
    </section>

    {p.actor !== null && <section class="session-section">
      <h2>You write as</h2>
      <p class="session-hint">
        On <code>{p.store}</code>.
        {p.actor && !p.actor.chosen && ' This is a suggestion until you save it.'}
        {p.actor?.enforced && ' This store accepts only the actor ids it declares.'}
      </p>
      <div class="session-actor">
        <input id="sessionActor" class="tool" type="text" value={draft} spellcheck={false}
          placeholder="human:you" disabled={p.busy}
          list={p.actor?.declared?.length ? 'sessionDeclaredActors' : undefined}
          onInput={event => { setTouched(true); setDraft(event.currentTarget.value) }} />
        {!!p.actor?.declared?.length && <datalist id="sessionDeclaredActors">
          {p.actor.declared.map(id => <option key={id} value={id} />)}
        </datalist>}
        <button type="button" class="tool primary" id="sessionActorSave" disabled={!changed || p.busy}
          onClick={() => p.onActor(draft.trim())}>Save</button>
      </div>
      {p.actorError && <p class="session-error" role="alert">{p.actorError}</p>}
    </section>}

    {p.session.admin && <section class="session-section">
      <h2>Administration</h2>
      <details class="session-people">
        <summary>Who has signed in{p.people ? ` (${p.people.length})` : ''}</summary>
        {p.people === undefined && <p class="session-hint">Loading.</p>}
        {p.people === null && <p class="session-hint">That could not be read.</p>}
        {p.people && p.people.length === 0 && <p class="session-hint">Nobody yet but you.</p>}
        {p.people && p.people.length > 0 && <ul class="person-list">
          {p.people.map(person => <li key={person.subject} class="person">
            <div class="person-head">
              <span class="person-name">{person.name || person.email || person.subject}</span>
              <span class="person-seen" title={`First seen ${person.firstSeen}`}>{when(person.lastSeen)}</span>
            </div>
            {person.email && person.name && <div class="person-email">{person.email}</div>}
            <div class="person-groups">
              {person.groups?.length
                ? person.groups.join(', ')
                // The diagnosis this list exists for: somebody who signed in
                // carrying nothing is a provider problem, not a grant problem.
                : 'carried no groups'}
            </div>
            {person.actors && Object.entries(person.actors).map(([store, actor]) =>
              <div key={store} class="person-actor">writes as <code>{actor}</code> on <code>{store}</code></div>)}
          </li>)}
        </ul>}
      </details>
    </section>}

    {p.session.logout && <section class="session-section">
      <a class="tool" id="sessionLogout" href={p.session.logout}>Sign out</a>
    </section>}
  </div>
}

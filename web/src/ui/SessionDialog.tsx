import { useEffect, useRef, useState } from 'preact/hooks'
import type { ActorResponse, SessionResponse } from '../platform/tickets/types'

export interface SessionDialogProps {
  session: SessionResponse
  /** The store being looked at. An actor belongs to one store. */
  store: string
  /** Undefined while the actor is in flight, null where this canvas has none. */
  actor?: ActorResponse | null
  /** A refusal from the last attempt to set an actor, already made readable. */
  actorError?: string
  busy?: boolean
  onActor(actor: string): void
  onClose(): void
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
        : <ul class="session-groups">
          {p.session.groups.map(group => <li key={group} class={granted.has(group) ? 'granted' : ''}>
            <span class="session-group-name">{group}</span>
            <span class="session-group-state">{granted.has(group) ? 'grants access' : 'grants nothing here'}</span>
          </li>)}
        </ul>}
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

    {p.session.logout && <section class="session-section">
      <a class="tool" id="sessionLogout" href={p.session.logout}>Sign out</a>
    </section>}
  </div>
}

import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { matchesTicket, type TicketFilters } from '../platform/tickets/filters'
import { cycleFinder, type RelationKind } from '../platform/tickets/relations'
import type { Op, Ticket } from '../platform/tickets/types'

/** Enough to choose from without the list outgrowing the inspector. Anything
 * past it is counted, so a person knows to keep typing. */
const SHOWN = 8

const none: Pick<TicketFilters, 'statuses' | 'labels'> = { statuses: new Set(), labels: new Map() }

export interface RelationPickerProps {
  ticket: Ticket
  kind: RelationKind
  tickets: ReadonlyMap<string, Ticket>
  readOnly: boolean
  onPatch: (ticket: Ticket, ops: Op[]) => Promise<unknown>
}

/** Adds a dependency or sets a parent by searching for the other ticket. The
 * drag from a card's handle does the same for a dependency, but a phone does
 * not offer that drag and a keyboard cannot perform it, so this is the path
 * that works everywhere and the drag stays as the fast one.
 *
 * It is a button that opens a search box in place, not a dialog: the inspector
 * already closes on Escape, and a second focus layer inside it would have to
 * fight that. The search box is a combobox. Arrow keys move through the
 * results, Enter picks one, and Escape closes the search and hands focus back
 * to the button without closing the inspector. */
export function RelationPicker({ ticket, kind, tickets, readOnly, onPatch }: RelationPickerProps) {
  const [opened, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [pending, setPending] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const mounted = useRef(true)
  useLayoutEffect(() => () => { mounted.current = false }, [])
  // A board that turns read-only while the search is open must not leave a
  // control behind that looks usable, nor reopen it when it turns writable.
  const open = opened && !readOnly
  useLayoutEffect(() => { if (readOnly) { setOpen(false); setQuery('') } }, [readOnly])
  useLayoutEffect(() => { if (open) search.current?.focus() }, [open])

  // Worked out once per opening and per change to the store, not per
  // keystroke: the cycle walk is the expensive part, and typing changes only
  // which of these candidates match.
  const linked = kind === 'dependency' ? ticket.dependencies : ticket.parent ? [ticket.parent] : []
  const candidates = useMemo(() => {
    if (!open) return { offered: [], refused: [] }
    const closes = cycleFinder(tickets)
    const offered: Ticket[] = [], refused: Ticket[] = []
    for (const other of tickets.values()) {
      if (other.id === ticket.id || linked.includes(other.id)) continue
      ;(closes(kind, ticket.id, other.id) ? refused : offered).push(other)
    }
    // Most recently touched first: the ticket somebody wants to link to is
    // usually one they have just been working on.
    offered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id))
    return { offered, refused }
  }, [open, tickets, ticket.id, kind, linked.join(' ')])

  // The board's own search predicate with only the query set, so a ticket the
  // search box finds on the board is one this finds too.
  const matching = (list: Ticket[]) => list.filter(other => matchesTicket(other, { ...none, query }))
  const results = open ? matching(candidates.offered) : []
  const shown = results.slice(0, SHOWN)
  const refused = open ? matching(candidates.refused).length : 0
  const current = Math.min(active, Math.max(0, shown.length - 1))

  const listId = `relation-${kind}-options`
  const optionId = (index: number) => `relation-${kind}-option-${index}`
  const label = kind === 'dependency' ? 'Add dependency…' : ticket.parent ? 'Change parent…' : 'Set parent…'
  const purpose = kind === 'dependency' ? `Find a ticket for ${ticket.short || ticket.id} to depend on`
    : `Find a parent for ${ticket.short || ticket.id}`

  const close = () => {
    setOpen(false)
    setQuery('')
    setActive(0)
    button.current?.focus()
  }
  const choose = async (other: Ticket | undefined) => {
    if (!other || readOnly || pending) return
    setPending(true)
    try {
      await onPatch(ticket, [kind === 'dependency'
        ? { op: 'addDependency', id: other.id }
        : { op: 'setParent', parent: other.id }])
      if (mounted.current) close()
    } catch {
      // The inspector's owner reports the error. Keeping the search open with
      // its query lets the person try again or pick another.
    } finally {
      if (mounted.current) setPending(false)
    }
  }

  return <div class="relation-picker">
    <button ref={button} type="button" class="tool" disabled={readOnly} aria-expanded={open}
      aria-controls={open ? listId : undefined} onClick={() => { if (open) close(); else setOpen(true) }}>{label}</button>
    {open && <div class="relation-search">
      {/* Held read-only while a pick is saving rather than disabled, because
          disabling the focused box would drop keyboard focus on the floor. */}
      <input ref={search} class="control" type="text" role="combobox" aria-label={purpose}
        aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
        aria-activedescendant={shown.length ? optionId(current) : undefined}
        placeholder="Search by ID or title…" value={query} readOnly={pending} aria-busy={pending}
        onInput={event => { setQuery(event.currentTarget.value); setActive(0) }}
        onKeyDown={event => {
          if (event.isComposing) return
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!shown.length) return
            const step = event.key === 'ArrowDown' ? 1 : -1
            setActive((current + step + shown.length) % shown.length)
          } else if (event.key === 'Enter') {
            event.preventDefault()
            void choose(shown[current])
          } else if (event.key === 'Escape') {
            // Close the search, not the inspector around it.
            event.stopPropagation()
            close()
          }
        }} />
      <ul id={listId} role="listbox" aria-label={purpose}>
        {shown.map((other, index) => <li key={other.id} id={optionId(index)} role="option"
          aria-selected={index === current} class={index === current ? 'active' : ''}
          // Keep focus in the search box, so a click and Enter go through the
          // same path and the combobox never loses its place.
          onMouseDown={event => event.preventDefault()}
          onMouseMove={() => { if (index !== current) setActive(index) }}
          onClick={() => void choose(other)}>
          <span class="id">{other.short || other.id}</span>
          <span class="t">{other.title}</span>
          <span class="status">{other.status}</span>
        </li>)}
      </ul>
      {!shown.length && <div class="muted">No ticket matches{query.trim() ? ` "${query.trim()}"` : ''}</div>}
      {results.length > shown.length && <div class="muted">
        {results.length - shown.length} more match. Keep typing to narrow them
      </div>}
      {refused > 0 && <div class="muted relation-refused">
        {refused} {refused === 1 ? 'ticket is' : 'tickets are'} left out because linking would close a cycle
      </div>}
    </div>}
  </div>
}

import type { ComponentChildren } from 'preact'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { ChecklistItem, Entry, Op, Schema, Ticket } from '../platform/tickets/types'
import './Inspector.css'

export interface InspectorProps {
  ticket: Ticket | null
  children?: ComponentChildren
  concealed?: boolean
  config: Schema | null
  tickets: ReadonlyMap<string, Ticket>
  readOnly: boolean
  onPatch: (ticket: Ticket, ops: Op[]) => Promise<unknown>
  onClose: () => void
  onNavigate: (id: string) => void
  onDelete: (ticket: Ticket) => Promise<unknown>
}

type Patch = InspectorProps['onPatch']

function isStale(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && error.code === 'stale_revision'
}

function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return <div class="field"><label>{label}</label>{children}</div>
}

interface TextProps {
  ticket: Ticket
  value?: string
  readOnly: boolean
  onPatch: Patch
  operation: (text: string) => Op
  multiline?: boolean
  enterToBlur?: boolean
  add?: boolean
  id?: string
  className?: string
  placeholder?: string
  list?: string
}

// Each editor keeps the ticket snapshot that supplied its draft. A refreshed
// parent can update metadata without replacing the DOM node or rebasing an edit.
function TextEditor({ ticket, value = '', readOnly, onPatch, operation,
  multiline = false, enterToBlur = false, add = false, id, className = 'control', placeholder, list }: TextProps) {
  const [, redraw] = useState(0)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const sizeTitle = () => {
    if (!enterToBlur || !textarea.current) return
    textarea.current.style.height = 'auto'
    textarea.current.style.height = `${textarea.current.scrollHeight + 2}px`
  }
  useLayoutEffect(sizeTitle)
  useLayoutEffect(() => {
    if (!enterToBlur || !textarea.current || typeof ResizeObserver === 'undefined') return
    let width = -1
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width === width) return
      width = entry.contentRect.width
      sizeTitle()
    })
    observer.observe(textarea.current)
    return () => observer.disconnect()
  }, [enterToBlur])
  const mounted = useRef(false)
  const latest = useRef({ ticket, value })
  latest.current = { ticket, value }
  const draft = useRef({
    ticket, initial: value, text: value, focused: false, pending: false,
    stale: false,
  })
  const refresh = () => { if (mounted.current) redraw(n => n + 1) }
  const reset = () => {
    const d = draft.current
    d.ticket = latest.current.ticket
    d.initial = add ? '' : latest.current.value
    d.text = d.initial
    d.stale = false
  }

  useLayoutEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useLayoutEffect(() => {
    const d = draft.current
    if (!d.focused && !d.pending &&
      (d.stale || (d.text === d.initial && d.ticket !== latest.current.ticket))) {
      const previous = d.text
      reset()
      if (d.text !== previous) refresh()
    }
  })

  const submit = async () => {
    const d = draft.current
    if (!mounted.current || readOnly || d.pending) return
    if (d.stale && !add) {
      reset()
      refresh()
      return
    }
    const text = add ? d.text.trim() : d.text
    if (add ? !text : text === d.initial) return
    const submitted = d.text
    const snapshot = d.ticket
    d.pending = true
    try {
      await onPatch(snapshot, [operation(text)])
      if (!mounted.current) return
      // Do not erase text entered while this request was in flight.
      if (d.text === submitted) {
        d.text = add ? '' : text
        d.initial = d.text
        d.ticket = latest.current.ticket
        if (!d.focused && latest.current.ticket.revision !== snapshot.revision) reset()
      }
    } catch (error) {
      // The parent reports errors. Ordinary failures keep the draft and its
      // original revision. A stale replacement yields to the reloaded server
      // value, but never while the user has focused the editor again.
      if (!add && isStale(error)) {
        d.stale = true
        if (!d.focused) reset()
      }
    } finally {
      d.pending = false
      refresh()
    }
  }

  const control = {
    id, class: className, placeholder, disabled: readOnly, value: draft.current.text,
    onFocus: () => {
      const d = draft.current
      if (!d.pending && d.text === d.initial && d.ticket !== latest.current.ticket) reset()
      d.focused = true
      refresh()
    },
    onInput: (event: Event) => {
      draft.current.text = (event.currentTarget as HTMLInputElement | HTMLTextAreaElement).value
      refresh()
    },
    onBlur: (event: FocusEvent) => {
      draft.current.focused = false
      // Cleanup never commits. Detached nodes can blur during tree removal.
      if (!mounted.current || !(event.currentTarget as HTMLElement).isConnected) return
      if (!add) void submit()
      refresh()
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.isComposing) return
      const element = event.currentTarget as HTMLInputElement | HTMLTextAreaElement
      if (event.key === 'Escape') {
        event.stopPropagation()
        element.blur()
      } else if (event.key === 'Enter' && (enterToBlur || !multiline || (add && (event.metaKey || event.ctrlKey)))) {
        event.preventDefault()
        if (add) void submit()
        else element.blur()
      }
    },
  }
  return multiline
    ? <textarea {...control} ref={textarea} rows={enterToBlur ? 1 : undefined}
      aria-label={enterToBlur ? 'Title' : undefined} style={add ? { minHeight: '46px' } : undefined} />
    : <input {...control} list={list} />
}

function Disclosure({ label, initiallyOpen = false, children }: {
  label: string; initiallyOpen?: boolean; children: ComponentChildren
}) {
  const details = useRef<HTMLDetailsElement>(null)
  // Native details owns expansion after mount. Polls never overwrite that state,
  // and hidden editor children remain mounted with their original draft snapshots.
  useLayoutEffect(() => { if (details.current) details.current.open = initiallyOpen }, [])
  return <details class="insp-section" ref={details}><summary>{label}</summary>{children}</details>
}

function StateSummary({ ticket: t }: { ticket: Ticket }) {
  const count = (n: number | undefined, singular: string, plural: string) => n ? `${n} ${n === 1 ? singular : plural}` : ''
  const blockers = [
    count(t.readiness.blocking?.length, 'dependency', 'dependencies'),
    count(t.readiness.blockingChildren?.length, 'child', 'children'),
    count(t.readiness.missing?.length, 'missing', 'missing'),
  ].filter(Boolean).join(', ')
  const blocked = t.readiness.blocked || t.status === 'blocked' || !!blockers
  const late = !!t.dueOn && t.dueOn < new Date().toISOString().slice(0, 10)
    && t.status !== 'done' && t.status !== 'archived'
  return <dl class="insp-state" aria-label="Ticket state">
    <div><dt>Status</dt><dd>{t.status}{t.archived ? ' · archived' : ''}</dd></div>
    <div><dt>Priority</dt><dd>{t.priority}</dd></div>
    <div><dt>Assigned</dt><dd>{t.assignees.join(', ') || 'Unassigned'}</dd></div>
    <div><dt>Claimed</dt><dd>{t.claim ? `${t.claim.actor}${t.claim.expired ? ' · expired' : ''}` : 'Unclaimed'}</dd></div>
    <div class={blocked ? 'insp-warning' : ''}><dt>Blockers</dt>
      <dd>{blockers || (blocked ? 'Blocked' : 'None')}
        {blocked && (t.readiness.reason || t.statusReason) && <span class="insp-reason">{t.readiness.reason || t.statusReason}</span>}
      </dd></div>
    <div class={late ? 'insp-warning' : ''}><dt>Due</dt><dd>{late ? 'Overdue · ' : ''}{t.dueOn || 'No due date'}</dd></div>
  </dl>
}

function SelectControl({ value = '', options, blank, readOnly, onChange }: {
  value?: string; options: readonly string[]; blank?: string; readOnly: boolean
  onChange: (value: string) => void
}) {
  return <select class="control" value={value} disabled={readOnly} onChange={event => {
    const next = event.currentTarget.value
    // Keep the displayed selection authoritative after cancellation or failure.
    event.currentTarget.value = value
    if (!readOnly && next !== value) onChange(next)
  }}>
    {blank && <option value="">{blank}</option>}
    {Array.from(new Set(options)).map(option => <option key={option} value={option}>{option}</option>)}
  </select>
}

function Checklist({ label, section, ticket, items, readOnly, onPatch }: {
  label: string; section: string; ticket: Ticket; items: readonly ChecklistItem[]
  readOnly: boolean; onPatch: Patch
}) {
  const commit = (op: Op) => {
    if (!readOnly) void onPatch(ticket, [op]).catch(() => {})
  }
  return <Field label={label}><div>
    {items.map(item => <div key={item.index} class={`checkitem${item.checked ? ' done' : ''}`}>
      <input type="checkbox" checked={item.checked} disabled={readOnly} onChange={event => {
        const checked = event.currentTarget.checked
        event.currentTarget.checked = item.checked
        commit({ op: 'setChecklistItem', section, index: item.index, checked })
      }} />
      <span>{item.text}</span>
      {!readOnly && <button onClick={() => commit({ op: 'removeChecklistItem', section, index: item.index })}>×</button>}
    </div>)}
    <TextEditor key="add" ticket={ticket} readOnly={readOnly} onPatch={onPatch} add
      placeholder="add item…" operation={text => ({ op: 'addChecklistItem', section, text })} />
  </div></Field>
}

function LogSection({ label, entries, ticket, readOnly, onPatch, op }: {
  label: string; entries: readonly Entry[]; ticket: Ticket; readOnly: boolean
  onPatch: Patch; op: 'appendNote' | 'appendComment'
}) {
  const entryView = (entry: Entry) => {
    const who = [entry.actor, entry.at?.slice(0, 16).replace('T', ' ')].filter(Boolean).join(' · ')
    return <div class="entry" key={entry.index}>
      {who && <div class="who">{who}</div>}
      <div class="what">{entry.text}</div>
    </div>
  }
  return <Disclosure label={`${label} · ${entries.length || 'add'}`} initiallyOpen={entries.length > 0}>
    <Field label={label}><div>
      <Disclosure label={`Older ${label.toLowerCase()} · ${Math.max(0, entries.length - 1)}`}>
        {entries.slice(0, -1).map(entryView)}
        {entries.length < 2 && <div class="muted">No older {label.toLowerCase()}</div>}
      </Disclosure>
      {entries.length > 0 && entryView(entries[entries.length - 1])}
      <TextEditor key="add" ticket={ticket} readOnly={readOnly} onPatch={onPatch} add multiline
        placeholder="add…  (⌘/Ctrl+Enter)" operation={text => ({ op, text })} />
    </div></Field>
  </Disclosure>
}

function Relation({ label, id, tickets, readOnly, onNavigate, onRemove }: {
  label: string; id: string; tickets: ReadonlyMap<string, Ticket>; readOnly: boolean
  onNavigate: (id: string) => void; onRemove: () => void
}) {
  const other = tickets.get(id)
  return <div class="linkline">
    <a title={id} onClick={() => { if (other) onNavigate(id) }}>{other ? other.short || id : id}</a>
    <span class="t">{other ? other.title : '(not in this store)'}</span>
    {!readOnly && <button title={`remove ${label}`} onClick={onRemove}>×</button>}
  </div>
}

function InspectorBody({ ticket: t, config, tickets, readOnly, onPatch, onNavigate }: {
  ticket: Ticket; config: Schema; tickets: ReadonlyMap<string, Ticket>; readOnly: boolean
  onPatch: Patch; onNavigate: (id: string) => void
}) {
  const commit = (op: Op) => {
    if (!readOnly) void onPatch(t, [op]).catch(() => {})
  }
  const textProps = { ticket: t, readOnly, onPatch }
  const relationProps = { tickets, readOnly, onNavigate }
  return <>
    <StateSummary ticket={t} />
    <Disclosure label="Edit status, priority, ownership and due date">
      <Field label="Status">
        <div class="row"><SelectControl value={t.status} options={[t.status, ...(config.transitions[t.status] || [])]}
          readOnly={readOnly} onChange={status => {
            let reason = ''
            if ((config.reasonRequired[t.status] || []).includes(status)) {
              reason = prompt(`Moving ${t.short} to ${status} needs a reason:`) || ''
              if (!reason.trim()) return
            }
            commit({ op: 'setStatus', status, reason })
          }} /></div>
        {t.statusReason && <div class="muted">{t.statusReason}</div>}
      </Field>
      <Field label="Type"><SelectControl value={t.type} options={config.types} readOnly={readOnly}
        onChange={type => commit({ op: 'setType', type })} /></Field>
      <Field label="Priority"><SelectControl value={t.priority} options={config.priorities} readOnly={readOnly}
        onChange={priority => commit({ op: 'setPriority', priority })} /></Field>
      <Field label="Due on"><TextEditor {...textProps} value={t.dueOn}
        operation={text => ({ op: 'setDueOn', dueOn: text.trim() || null })} /></Field>
      {config.milestones.length > 0 && <Field label="Milestone">
        <SelectControl value={t.milestone} options={config.milestones} blank="none" readOnly={readOnly}
          onChange={milestone => commit({ op: 'setMilestone', milestone: milestone || null })} />
      </Field>}
      <Field label="Assignees"><div class="row">
        {t.assignees.map(actor => <button key={actor} class="chip" style={{ color: 'var(--ink-dim)' }}
          disabled={readOnly} onClick={() => commit({ op: 'unassign', actor })}>{actor} ×</button>)}
        <TextEditor key="add" {...textProps} add placeholder="assign…" operation={actor => ({ op: 'assign', actor })} />
      </div></Field>
    </Disclosure>
    <Field label="Labels"><div class="row">
      {t.labels.map(label => <button key={label} class="chip" style={{ color: 'var(--ink-dim)' }}
        disabled={readOnly} onClick={() => commit({ op: 'removeLabel', label })}>{label} ×</button>)}
      {!t.labels.length && <span class="muted">No labels</span>}
      <TextEditor key="add" {...textProps} add placeholder="add label…" list="labelList"
        operation={label => ({ op: 'addLabel', label })} />
      <datalist id="labelList">{config.labels.map(label => <option key={label} value={label}>{label}</option>)}</datalist>
    </div></Field>
    <Disclosure label={`Relationships · ${t.dependencies.length} dependencies, ${t.parent ? 1 : 0} parent`}>
      <Field label="Parent"><div>
        {t.parent ? <Relation {...relationProps} label="parent" id={t.parent}
          onRemove={() => commit({ op: 'setParent', parent: null })} /> : <div class="muted">no parent</div>}
      </div></Field>
      <Field label="Depends on"><div>
        {t.dependencies.map(id => <Relation key={id} {...relationProps} label="dependency" id={id}
          onRemove={() => commit({ op: 'removeDependency', id })} />)}
        {!t.dependencies.length && <div class="muted">none. Drag a card's right handle onto another to add one</div>}
        {!!t.readiness.missing?.length && <div class="muted" style={{ color: 'var(--danger)' }}>
          missing: {t.readiness.missing.join(', ')}
        </div>}
      </div></Field>
      {(t.type === 'epic' || t.blocksOn === 'children') && <Field label="Blocks on">
        <SelectControl value={t.blocksOn} options={config.blocksOn} readOnly={readOnly}
          onChange={blocksOn => commit({ op: 'setBlocksOn', blocksOn })} />
      </Field>}
    </Disclosure>
    <Field label="Description"><TextEditor {...textProps} multiline value={t.body.description}
      operation={text => ({ op: 'setDescription', text })} /></Field>
    <Disclosure label="Implementation plan · edit" initiallyOpen={!!t.body.plan}>
      <Field label="Implementation plan"><TextEditor {...textProps} multiline value={t.body.plan}
        operation={text => ({ op: 'setPlan', text })} /></Field>
    </Disclosure>
    <Disclosure label={`Acceptance criteria · ${t.body.acceptanceCriteria.length || 'add'}`} initiallyOpen={t.body.acceptanceCriteria.length > 0}>
      <Checklist {...textProps} label="Acceptance criteria" section="ac" items={t.body.acceptanceCriteria} />
    </Disclosure>
    <Disclosure label={`Definition of done · ${t.body.definitionOfDone.length || 'add'}`} initiallyOpen={t.body.definitionOfDone.length > 0}>
      <Checklist {...textProps} label="Definition of done" section="dod" items={t.body.definitionOfDone} />
    </Disclosure>
    <LogSection {...textProps} label="Notes" entries={t.body.notes} op="appendNote" />
    <LogSection {...textProps} label="Comments" entries={t.body.comments} op="appendComment" />
    <Disclosure label="Summary · edit" initiallyOpen={!!t.body.summary}>
      <Field label="Summary"><TextEditor {...textProps} multiline value={t.body.summary}
        operation={text => ({ op: 'setSummary', text })} /></Field>
    </Disclosure>
  </>
}

export function Inspector({ ticket, config, tickets, readOnly, onPatch, onClose, onNavigate, onDelete, children, concealed }: InspectorProps) {
  const panel = useRef<HTMLElement>(null)
  const separator = useRef<HTMLDivElement>(null)
  const width = useRef(400)
  const drag = useRef<{ pointerId: number; x: number; width: number } | null>(null)
  const resize = (next: number) => {
    width.current = Math.min(560, Math.max(320, Math.round(next)))
    // Resizing changes layout, not editor state. Keep pointer frames out of the
    // component tree so a focused textarea and its selection stay untouched.
    panel.current?.style.setProperty('--inspector-width', `${width.current}px`)
    separator.current?.setAttribute('aria-valuenow', String(width.current))
    separator.current?.setAttribute('aria-valuetext', `${width.current} pixels`)
  }
  const finishResize = (event: PointerEvent) => {
    if (drag.current?.pointerId !== event.pointerId) return
    event.stopPropagation()
    drag.current = null
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
  }
  // A cheap diagnostic used by the browser responsiveness regression.
  const renders = useRef(0)
  renders.current++
  const commit = (op: Op) => {
    if (ticket && !readOnly) void onPatch(ticket, [op]).catch(() => {})
  }
  return <aside id="inspector" ref={panel} style={{ '--inspector-width': `${width.current}px`, display: concealed ? 'none' : undefined }}
    data-render-count={renders.current} class={ticket && !concealed ? 'open' : ''} aria-hidden={!ticket || concealed} aria-label="Ticket inspector"
    onKeyDown={event => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }}>
    <div class="insp-resize" ref={separator} role="separator" tabIndex={ticket ? 0 : -1}
      aria-label="Inspector width" aria-controls="inspector" aria-orientation="vertical"
      aria-valuemin={320} aria-valuemax={560} aria-valuenow={width.current} aria-valuetext={`${width.current} pixels`}
      title="Resize inspector. Left widens, Right narrows; Home sets 320px, End sets 560px."
      onPointerDown={event => {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        drag.current = { pointerId: event.pointerId, x: event.clientX, width: width.current }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event => {
        if (drag.current?.pointerId !== event.pointerId) return
        event.stopPropagation()
        resize(drag.current.width + drag.current.x - event.clientX)
      }}
      onPointerUp={finishResize} onPointerCancel={finishResize}
      onLostPointerCapture={() => { drag.current = null }}
      onKeyDown={event => {
        let next: number
        if (event.key === 'ArrowLeft') next = width.current + 16
        else if (event.key === 'ArrowRight') next = width.current - 16
        else if (event.key === 'Home') next = 320
        else if (event.key === 'End') next = 560
        else return
        event.preventDefault()
        event.stopPropagation()
        resize(next)
      }} />
    <div class="insp-head">
      <div style={{ flex: 1, minWidth: 0 }}>
        {ticket ? <TextEditor key={ticket.id} ticket={ticket} value={ticket.title} readOnly={readOnly}
          onPatch={onPatch} operation={title => ({ op: 'setTitle', title })}
          id="fTitle" className="insp-title" placeholder="Title" multiline enterToBlur />
          : <input id="fTitle" class="insp-title" placeholder="Title" disabled />}
        <div class="muted" id="fMeta">{ticket && `${ticket.id}  ·  updated ${ticket.updatedAt.slice(0, 16).replace('T', ' ')}${ticket.updatedBy ? ` by ${ticket.updatedBy}` : ''}`}</div>
      </div>
      <button id="inspClose" class="tool" title="Close (Esc)" onClick={onClose}>×</button>
    </div>
    <div class="insp-body" id="inspBody">
      {ticket && config && <InspectorBody key={ticket.id} ticket={ticket} config={config} tickets={tickets}
        readOnly={readOnly} onPatch={onPatch} onNavigate={onNavigate} />}
      {ticket && children}
    </div>
    <div class="insp-foot">
      <button id="btnClaim" class="tool" disabled={readOnly || !ticket}
        onClick={() => commit(ticket?.claim ? { op: 'release' } : { op: 'claim' })}>{ticket?.claim ? 'Release' : 'Claim'}</button>
      <button id="btnArchive" class="tool" disabled={readOnly || !ticket} onClick={() => {
        if (!ticket || readOnly) return
        if (ticket.archived) commit({ op: 'unarchive' })
        else commit({ op: 'archive', reason: prompt('Archiving is recorded with a reason:') || '' })
      }}>{ticket?.archived ? 'Unarchive' : 'Archive'}</button>
      <div class="spacer" />
      <button id="btnDelete" class="tool danger" disabled={readOnly || !ticket} onClick={() => {
        if (ticket && !readOnly) void onDelete(ticket).catch(() => {})
      }}>Delete</button>
    </div>
  </aside>
}

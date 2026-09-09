import type { ComponentChildren } from 'preact'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { ChecklistItem, Entry, Op, Schema, Ticket } from '../platform/tickets/types'

export interface InspectorProps {
  ticket: Ticket | null
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
  add?: boolean
  id?: string
  className?: string
  placeholder?: string
  list?: string
}

// Each editor keeps the ticket snapshot that supplied its draft. A refreshed
// parent can update metadata without replacing the DOM node or rebasing an edit.
function TextEditor({ ticket, value = '', readOnly, onPatch, operation,
  multiline = false, add = false, id, className = 'control', placeholder, list }: TextProps) {
  const [, redraw] = useState(0)
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
      } else if (event.key === 'Enter' && (!multiline || (add && (event.metaKey || event.ctrlKey)))) {
        event.preventDefault()
        if (add) void submit()
        else element.blur()
      }
    },
  }
  return multiline
    ? <textarea {...control} style={add ? { minHeight: '46px' } : undefined} />
    : <input {...control} list={list} />
}

function SummaryField(props: Omit<TextProps, 'operation'>) {
  // Once visible, keep this editor mounted even if a poll clears the summary.
  const visible = useRef(!!props.value)
  if (props.value) visible.current = true
  return visible.current ? <Field label="Summary"><TextEditor {...props} multiline
    operation={text => ({ op: 'setSummary', text })} /></Field> : null
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
  return <Field label={label}><div>
    {entries.map(entry => {
      const who = [entry.actor, entry.at?.slice(0, 16).replace('T', ' ')].filter(Boolean).join(' · ')
      return <div class="entry" key={entry.index}>
        {who && <div class="who">{who}</div>}
        <div class="what">{entry.text}</div>
      </div>
    })}
    <TextEditor key="add" ticket={ticket} readOnly={readOnly} onPatch={onPatch} add multiline
      placeholder="add…  (⌘/Ctrl+Enter)" operation={text => ({ op, text })} />
  </div></Field>
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
    <Field label="Labels"><div class="row">
      {t.labels.map(label => <button key={label} class="chip" style={{ color: 'var(--ink-dim)' }}
        disabled={readOnly} onClick={() => commit({ op: 'removeLabel', label })}>{label} ×</button>)}
      <TextEditor key="add" {...textProps} add placeholder="add label…" list="labelList"
        operation={label => ({ op: 'addLabel', label })} />
      <datalist id="labelList">{config.labels.map(label => <option key={label} value={label}>{label}</option>)}</datalist>
    </div></Field>
    <Field label="Assignees"><div class="row">
      {t.assignees.map(actor => <button key={actor} class="chip" style={{ color: 'var(--ink-dim)' }}
        disabled={readOnly} onClick={() => commit({ op: 'unassign', actor })}>{actor} ×</button>)}
      <TextEditor key="add" {...textProps} add placeholder="assign…" operation={actor => ({ op: 'assign', actor })} />
    </div></Field>
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
    <Field label="Description"><TextEditor {...textProps} multiline value={t.body.description}
      operation={text => ({ op: 'setDescription', text })} /></Field>
    <Field label="Implementation plan"><TextEditor {...textProps} multiline value={t.body.plan}
      operation={text => ({ op: 'setPlan', text })} /></Field>
    <Checklist {...textProps} label="Acceptance criteria" section="ac" items={t.body.acceptanceCriteria} />
    <Checklist {...textProps} label="Definition of done" section="dod" items={t.body.definitionOfDone} />
    <LogSection {...textProps} label="Notes" entries={t.body.notes} op="appendNote" />
    <LogSection {...textProps} label="Comments" entries={t.body.comments} op="appendComment" />
    <SummaryField {...textProps} value={t.body.summary} />
  </>
}

export function Inspector({ ticket, config, tickets, readOnly, onPatch, onClose, onNavigate, onDelete }: InspectorProps) {
  const commit = (op: Op) => {
    if (ticket && !readOnly) void onPatch(ticket, [op]).catch(() => {})
  }
  return <aside id="inspector" class={ticket ? 'open' : ''} aria-hidden={!ticket}
    onKeyDown={event => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }}>
    <div class="insp-head">
      <div style={{ flex: 1, minWidth: 0 }}>
        {ticket ? <TextEditor key={ticket.id} ticket={ticket} value={ticket.title} readOnly={readOnly}
          onPatch={onPatch} operation={title => ({ op: 'setTitle', title })}
          id="fTitle" className="insp-title" placeholder="Title" />
          : <input id="fTitle" class="insp-title" placeholder="Title" disabled />}
        <div class="muted" id="fMeta">{ticket && `${ticket.id}  ·  updated ${ticket.updatedAt.slice(0, 16).replace('T', ' ')}${ticket.updatedBy ? ` by ${ticket.updatedBy}` : ''}`}</div>
      </div>
      <button id="inspClose" class="tool" title="Close (Esc)" onClick={onClose}>×</button>
    </div>
    <div class="insp-body" id="inspBody">
      {ticket && config && <InspectorBody key={ticket.id} ticket={ticket} config={config} tickets={tickets}
        readOnly={readOnly} onPatch={onPatch} onNavigate={onNavigate} />}
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

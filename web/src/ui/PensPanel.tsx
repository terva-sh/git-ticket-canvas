import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { Cards, Match, Pen, Routing, Schema, Ticket } from '../platform/tickets/types'
import { PEN_COLORS, addPen, matchEmpty, moveRule, overlaps, penIdFor, preview, problems, removePen, sameRouting, setInbox, updatePen } from '../platform/canvas/pens'
import { ruleText } from './Placement'
import './Pens.css'

/** The board's rules, authored in the browser. Every edit lands in a draft
 * the parent holds; Preview evaluates exactly that draft; Apply writes
 * exactly what was previewed; Cancel discards. The parent owns the draft and
 * the preview because the canvas shows the preview, and a panel that closes
 * mid-save must not take the save with it. */
export interface PensPanelProps {
  /** The routing the board has on disk, as last read. */
  accepted: Routing
  draft: Routing
  /** The exact routing Preview evaluated, or null when nothing is previewed. */
  previewed: Routing | null
  tickets: ReadonlyMap<string, Ticket>
  cards: Cards
  config: Schema | null
  readOnly: boolean
  /** An Apply in flight. */
  pending: boolean
  /** Why the last preview was discarded, when it was. */
  conflict: string
  onDraft(next: Routing): void
  onPreview(): void
  /** Resolves with how it ended; a refusal is an outcome, not an exception. */
  onApply(): Promise<'saved' | 'refused'>
  onCancel(): void
  onClose(): void
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const num = (s: string) => Number(s.trim())
const numeric = (s: string) => s.trim() !== '' && Number.isFinite(Number(s.trim()))

interface Form {
  id: string; creating: boolean
  /** The ID was typed by hand, so the title no longer suggests it. */
  idTouched: boolean
  title: string; x: string; y: string; w: string; h: string; color: string; pinX: string; pinY: string
  match: Match
}
const formFor = (id: string, p: Pen, creating: boolean): Form => ({
  id, creating, idTouched: !creating, title: p.title, x: String(p.x), y: String(p.y), w: String(p.w), h: String(p.h), color: p.color,
  pinX: String(p.pin.x), pinY: String(p.pin.y),
  match: { labels: [...p.match.labels], status: [...p.match.status], type: [...p.match.type], parent: [...p.match.parent] },
})
const penOf = (f: Form): Pen => ({ title: f.title.trim(), x: num(f.x), y: num(f.y), w: num(f.w), h: num(f.h), color: f.color,
  pin: { x: num(f.pinX), y: num(f.pinY) }, match: f.match })

export interface Suggestion { label: string; configured: boolean; used: boolean }

export function suggestionsFor(config: Schema | null, tickets: Iterable<Ticket>): Suggestion[] {
  const all = new Map<string, Suggestion>()
  for (const label of config?.labels ?? []) all.set(label, { label, configured: true, used: false })
  for (const t of tickets) for (const label of t.labels) {
    const s = all.get(label)
    if (s) s.used = true
    else all.set(label, { label, configured: false, used: true })
  }
  return [...all.values()].sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0)
}

/** The "Required labels" field of docs/pen-rule-authoring-addendum-v1.md:
 * tokens, a searching input beneath, exact identity, no splitting, duplicate
 * feedback, a warning for a label nothing carries, and the keyboard. */
export function LabelTokens({ value, suggestions, disabled, onChange }: {
  value: readonly string[]; suggestions: readonly Suggestion[]; disabled: boolean; onChange(next: string[]): void
}) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const [feedback, setFeedback] = useState('')
  const known = new Map(suggestions.map(s => [s.label, s]))
  const typed = text.trim()
  const shown = typed ? suggestions.filter(s => s.label.toLowerCase().includes(typed.toLowerCase()) && !value.includes(s.label)).slice(0, 8) : []
  const exact = shown.some(s => s.label === typed)
  const add = (label: string) => {
    const clean = label.trim()
    if (!clean) { setFeedback('Enter a label first.'); return }
    if (value.includes(clean)) { setFeedback(`"${clean}" is already required.`); return }
    onChange([...value, clean])
    setText(''); setOpen(false); setHighlight(-1); setFeedback('')
  }
  const choices = [...shown.map(s => s.label), ...(typed && !exact ? [typed] : [])]
  return <div class="pen-labels">
    <ul class="pen-tokens" aria-label="Required labels">{value.map(label => <li key={label}>
      <span>{label}</span>
      <button type="button" disabled={disabled} aria-label={`Remove required label ${label}`}
        onClick={() => { onChange(value.filter(other => other !== label)); setFeedback('') }}>×</button>
    </li>)}</ul>
    <p class="pen-help">Tickets must have every label above. Additional ticket labels are allowed.</p>
    <p class="pen-help" aria-live="polite">{value.length} distinct required {value.length === 1 ? 'label' : 'labels'}</p>
    {value.filter(label => !known.has(label)).map(label => <p key={label} class="pen-warning" role="status">
      "{label}" is not currently configured or used. This rule will match tickets if that label appears.</p>)}
    <div class="pen-label-entry">
      <input type="text" placeholder="Add a required label" aria-label="Add a required label" value={text} disabled={disabled}
        role="combobox" aria-expanded={open && choices.length > 0} aria-autocomplete="list" aria-controls="penLabelChoices"
        onInput={event => { setText(event.currentTarget.value); setOpen(true); setHighlight(-1); setFeedback('') }}
        onFocus={() => setOpen(true)}
        onKeyDown={event => {
          if (event.isComposing) return
          if (event.key === 'ArrowDown' && choices.length) { event.preventDefault(); setOpen(true); setHighlight(h => (h + 1) % choices.length) }
          else if (event.key === 'ArrowUp' && choices.length) { event.preventDefault(); setHighlight(h => (h <= 0 ? choices.length : h) - 1) }
          else if (event.key === 'Enter') { event.preventDefault(); add(highlight >= 0 && choices[highlight] !== undefined ? choices[highlight] : typed) }
          else if (event.key === 'Escape' && open && choices.length) { event.preventDefault(); event.stopPropagation(); setOpen(false); setHighlight(-1) }
          // Backspace in an empty input deletes nothing: a token goes through its own control.
        }} />
      {open && choices.length > 0 && <ul id="penLabelChoices" role="listbox" class="pen-choices">{choices.map((label, i) => {
        const s = known.get(label)
        const source = s ? [s.configured && 'Configured', s.used && 'Used on tickets'].filter(Boolean).join(' · ') : ''
        return <li key={label} role="option" aria-selected={i === highlight} class={i === highlight ? 'highlight' : ''}
          onMouseDown={event => { event.preventDefault(); add(label) }}>
          {s ? <>{label}{source && <small> {source}</small>}</> : <>Use "{label}"</>}
        </li>
      })}</ul>}
    </div>
    {feedback && <p class="pen-feedback" role="status">{feedback}</p>}
  </div>
}

function CheckList({ label, options, value, disabled, onChange }: {
  label: string; options: readonly string[]; value: readonly string[]; disabled: boolean; onChange(next: string[]): void
}) {
  return <fieldset class="pen-checks" disabled={disabled}><legend>{label}</legend>
    {options.map(option => <label key={option}><input type="checkbox" checked={value.includes(option)}
      onChange={event => onChange(event.currentTarget.checked ? [...value, option] : value.filter(v => v !== option))} /> {option}</label>)}
    {!options.length && <span class="pen-help">None configured</span>}
  </fieldset>
}

export function PensPanel(p: PensPanelProps) {
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const mounted = useRef(true)
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const locked = p.readOnly || p.pending
  const issues = problems(p.draft)
  const dirty = !sameRouting(p.draft, p.accepted)
  const previewCurrent = !!p.previewed && sameRouting(p.previewed, p.draft)
  const changed = preview(p.accepted, p.draft, p.tickets.values(), p.cards)
  const shown = p.previewed ? preview(p.accepted, p.previewed, p.tickets.values(), p.cards) : null
  const ties = overlaps(p.draft, p.tickets.values(), p.cards)
  const suggestions = suggestionsFor(p.config, p.tickets.values())
  const title = (id: string) => id === 'inbox' ? 'the inbox' : `${p.draft.pens[id]?.title ?? p.accepted.pens[id]?.title ?? id} (${id})`
  const name = (id: string) => p.tickets.get(id)?.title ?? id

  const edit = (id: string) => { setForm(formFor(id, p.draft.pens[id], false)); setError('') }
  const create = () => {
    const id = penIdFor('', p.draft.ruleOrder)
    setForm(formFor(id, { title: '', x: 0, y: 0, w: 1000, h: 400, color: PEN_COLORS[0], pin: { x: 0, y: 0 },
      match: { labels: [], status: [], type: [], parent: [] } }, true))
    setError('')
  }
  const done = () => {
    if (!form) return
    if (![form.x, form.y, form.w, form.h, form.pinX, form.pinY].every(numeric)) { setError('Enter finite coordinates for the region and the pin.'); return }
    const id = form.creating ? form.id.trim() : form.id
    if (form.creating && p.draft.pens[id]) { setError(`The board already has a pen "${id}".`); return }
    const next = form.creating ? addPen(p.draft, id, penOf(form)) : updatePen(p.draft, id, penOf(form))
    const wrong = problems(next).filter(issue => issue.pen === id)
    if (wrong.length) { setError(wrong.map(issue => issue.message).join(' ')); return }
    p.onDraft(next)
    setForm(null); setError('')
  }
  const apply = async () => {
    if (locked || !previewCurrent) return
    setNotice(''); setError('')
    try { if (await p.onApply() === 'saved' && mounted.current) setNotice('Rules saved.') }
    catch (failure) { if (mounted.current) setError(message(failure)) }
  }
  const field = (key: keyof Omit<Form, 'match' | 'creating' | 'idTouched'>, label: string, type: 'text' | 'number' = 'text') =>
    <label class="pen-field">{label}<input type={type} step={type === 'number' ? 'any' : undefined} value={form![key]} disabled={locked}
      onInput={event => setForm(f => {
        if (!f) return f
        const next = { ...f, [key]: event.currentTarget.value }
        // A new pen's ID follows its title until somebody types an ID.
        if (key === 'title' && f.creating && !f.idTouched) next.id = penIdFor(event.currentTarget.value, p.draft.ruleOrder)
        return next
      })} /></label>
  const matchField = (key: keyof Match, next: string[]) => setForm(f => f && { ...f, match: { ...f.match, [key]: next } })

  return <aside id="pensPanel" class="open" aria-label="Pens">
    <header class="pen-head"><h2>Pens</h2>
      <button type="button" onClick={p.onClose} aria-label="Close pens panel">Close</button></header>
    <div class="pen-body" onKeyDown={event => {
      if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); if (form) setForm(null); else p.onCancel() }
    }}>
      {p.readOnly && <p class="pen-notice">Read-only. Rules can be read here and changed with git ticket canvas on the desk.</p>}
      {p.pending && <p role="status">Saving rules. Closing this panel does not cancel the save.</p>}
      {p.conflict && <p class="pen-error" role="alert">{p.conflict}</p>}
      {error && <p class="pen-error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <p class="pen-help">Rules are tried in order and the first match wins; a card matching no rule goes to the inbox. Every change here is a draft until Apply.</p>

      <section class="pen-section" aria-label="Rule order">
        <h3>Rule order</h3>
        <ol class="pen-rules">{p.draft.ruleOrder.map((id, i) => {
          const pen = p.draft.pens[id], count = changed.counts[id]
          return <li key={id} data-pen-id={id}>
            <div class="pen-rule-title"><strong>{pen.title}</strong> <small>{id}</small></div>
            <div class="pen-help">{ruleText(pen.match)}</div>
            <div class="pen-help" data-pen-count={count?.after}>{count?.after ?? 0} automatic{count && count.before !== count.after ? ` (${count.before} now)` : ''}</div>
            {ties.filter(t => t.pen === id).map(t => <div key={t.takenBy} class="pen-warning">
              {t.ids.length} {t.ids.length === 1 ? 'card' : 'cards'} also match this rule but {title(t.takenBy)} is earlier and takes {t.ids.length === 1 ? 'it' : 'them'}.</div>)}
            <div class="pen-actions">
              <button type="button" disabled={locked || i === 0} aria-label={`Move ${pen.title} earlier`} onClick={() => p.onDraft(moveRule(p.draft, id, -1))}>Earlier</button>
              <button type="button" disabled={locked || i === p.draft.ruleOrder.length - 1} aria-label={`Move ${pen.title} later`} onClick={() => p.onDraft(moveRule(p.draft, id, 1))}>Later</button>
              <button type="button" disabled={locked} aria-label={`Edit ${pen.title}`} onClick={() => edit(id)}>Edit</button>
              <button type="button" disabled={locked} aria-label={`Remove ${pen.title}`} onClick={() => { p.onDraft(removePen(p.draft, id)); if (form?.id === id) setForm(null) }}>Remove</button>
            </div>
          </li>
        })}</ol>
        {!p.draft.ruleOrder.length && <p class="pen-help">No pens. Cards are placed in status lanes until the first rule exists.</p>}
        <div class="pen-actions"><button type="button" id="btnAddPen" disabled={locked || !!form?.creating} onClick={create}>Add pen</button></div>
      </section>

      {form && <section class="pen-section pen-form" aria-label={form.creating ? 'New pen' : `Edit ${form.title || form.id}`}>
        <h3>{form.creating ? 'New pen' : `Edit ${p.draft.pens[form.id]?.title ?? form.id}`}</h3>
        {field('title', 'Title')}
        {form.creating
          ? <label class="pen-field">ID<input type="text" value={form.id} disabled={locked}
            onInput={event => setForm(f => f && { ...f, id: event.currentTarget.value, idTouched: true })} /></label>
          : <p class="pen-help">ID {form.id}</p>}
        <label class="pen-field">Colour<select value={form.color} disabled={locked} onInput={event => setForm(f => f && { ...f, color: event.currentTarget.value })}>
          <option value="#759bcc">Blue</option><option value="#b499be">Plum</option><option value="#89ad97">Sage</option></select></label>
        <div class="pen-geometry">{field('x', 'X', 'number')}{field('y', 'Y', 'number')}{field('w', 'Width', 'number')}{field('h', 'Height', 'number')}</div>
        <div class="pen-geometry">{field('pinX', 'Pin X', 'number')}{field('pinY', 'Pin Y', 'number')}</div>
        <h4>Rule</h4>
        {matchEmpty(form.match) && <p class="pen-error" role="alert">Add at least one rule field: labels, status, type or parent. Unmatched automatic cards go to Inbox.</p>}
        <LabelTokens value={form.match.labels} suggestions={suggestions} disabled={locked} onChange={next => matchField('labels', next)} />
        <CheckList label="Status, any of" options={p.config?.statuses ?? []} value={form.match.status} disabled={locked} onChange={next => matchField('status', next)} />
        <CheckList label="Type, any of" options={p.config?.types ?? []} value={form.match.type} disabled={locked} onChange={next => matchField('type', next)} />
        <ParentTokens value={form.match.parent} tickets={p.tickets} disabled={locked} onChange={next => matchField('parent', next)} />
        <div class="pen-actions">
          <button type="button" id="btnPenDone" disabled={locked || matchEmpty(form.match)} onClick={done}>{form.creating ? 'Add to draft' : 'Keep changes'}</button>
          <button type="button" onClick={() => { setForm(null); setError('') }}>Discard</button>
        </div>
      </section>}

      <section class="pen-section" aria-label="Inbox">
        <h3>Inbox</h3>
        <div class="pen-geometry">
          <label class="pen-field">X<input type="number" step="any" value={String(p.draft.inbox.x)} disabled={locked}
            onInput={event => numeric(event.currentTarget.value) && p.onDraft(setInbox(p.draft, { x: num(event.currentTarget.value), y: p.draft.inbox.y }))} /></label>
          <label class="pen-field">Y<input type="number" step="any" value={String(p.draft.inbox.y)} disabled={locked}
            onInput={event => numeric(event.currentTarget.value) && p.onDraft(setInbox(p.draft, { x: p.draft.inbox.x, y: num(event.currentTarget.value) }))} /></label>
        </div>
        <p class="pen-help">{changed.inbox.after} automatic {changed.inbox.after === 1 ? 'card' : 'cards'} matched no rule{changed.inbox.before !== changed.inbox.after ? ` (${changed.inbox.before} now)` : ''}.</p>
      </section>

      {shown && <section class="pen-section pen-preview" aria-label="Preview">
        <h3>Preview</h3>
        {!previewCurrent && <p class="pen-warning" role="status">The draft changed since this preview. Preview again before Apply.</p>}
        <p aria-live="polite">{shown.moves.length} automatic {shown.moves.length === 1 ? 'card changes' : 'cards change'} destination.</p>
        <ul class="pen-moves">{shown.moves.map(m => <li key={m.id}>{name(m.id)}: {title(m.from)} → {title(m.to)}</li>)}</ul>
        {shown.pinnedWouldMove.length > 0 && <>
          <p>{shown.pinnedWouldMove.length} pinned {shown.pinnedWouldMove.length === 1 ? 'card stays' : 'cards stay'} where {shown.pinnedWouldMove.length === 1 ? 'it was' : 'they were'}, but would go elsewhere if released:</p>
          <ul class="pen-moves">{shown.pinnedWouldMove.map(m => <li key={m.id}>{name(m.id)}: {title(m.from)} → {title(m.to)}</li>)}</ul>
        </>}
      </section>}

      <div class="pen-actions pen-commit">
        <button type="button" id="btnPenPreview" disabled={locked || !dirty || issues.length > 0 || !!form} onClick={p.onPreview}>Preview</button>
        <button type="button" id="btnPenApply" disabled={locked || !previewCurrent || issues.length > 0 || !!form} onClick={() => void apply()}>Apply</button>
        <button type="button" id="btnPenCancel" disabled={p.pending || !dirty && !p.previewed} onClick={() => { setForm(null); setError(''); setNotice(''); p.onCancel() }}>Cancel</button>
      </div>
      {issues.length > 0 && !form && <p class="pen-error" role="alert">{issues.map(i => i.message).join(' ')}</p>}
      {!dirty && !p.previewed && <p class="pen-help">The draft matches the board.</p>}
    </div>
  </aside>
}

function ParentTokens({ value, tickets, disabled, onChange }: {
  value: readonly string[]; tickets: ReadonlyMap<string, Ticket>; disabled: boolean; onChange(next: string[]): void
}) {
  const [text, setText] = useState('')
  const [feedback, setFeedback] = useState('')
  const add = () => {
    const id = text.trim()
    if (!id) return
    if (value.includes(id)) { setFeedback(`${id} is already a parent of this rule.`); return }
    onChange([...value, id]); setText(''); setFeedback('')
  }
  return <div class="pen-parents">
    <ul class="pen-tokens" aria-label="Parents, any of">{value.map(id => <li key={id}><span>{tickets.get(id)?.title ?? id} <small>{id}</small></span>
      <button type="button" disabled={disabled} aria-label={`Remove parent ${id}`} onClick={() => onChange(value.filter(other => other !== id))}>×</button></li>)}</ul>
    <label class="pen-field">Parent, any of<input type="text" list="penParentChoices" placeholder="Ticket ID" value={text} disabled={disabled}
      onInput={event => { setText(event.currentTarget.value); setFeedback('') }}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add() } }} /></label>
    <datalist id="penParentChoices">{[...tickets.values()].map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</datalist>
    <div class="pen-actions"><button type="button" disabled={disabled || !text.trim()} onClick={add}>Add parent</button></div>
    {feedback && <p class="pen-feedback" role="status">{feedback}</p>}
  </div>
}

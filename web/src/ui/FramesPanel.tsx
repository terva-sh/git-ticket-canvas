import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { Frame, Frames, Ticket } from '../platform/tickets/types'
import './Frames.css'

export interface FramePanelProps {
  frame: Frame
  creating: boolean
  tickets: ReadonlyMap<string, Ticket>
  matching: ReadonlySet<string>
  readOnly: boolean
  pending: boolean
  onClose(): void
  onCapture(bounds: Frame): string[]
  onRemoveMissing?(ids: string[]): Promise<unknown>
  onSave(kind: 'create' | 'move' | 'resize' | 'appearance' | 'delete', frame: Frame, baseline?: Frame): Promise<unknown>
}

export interface FrameMembershipProps {
  ticketId: string
  frames: Frames
  readOnly: boolean
  pending: boolean
  onChange(target: string | null): Promise<unknown>
  onSelectFrame(id: string): void
}

type Field = 'title' | 'color' | 'x' | 'y' | 'w' | 'h'
type Group = 'appearance' | 'move' | 'resize'
const groups: Record<Group, Field[]> = { appearance: ['title', 'color'], move: ['x', 'y'], resize: ['w', 'h'] }
const groupNames: Group[] = ['appearance', 'move', 'resize']
const fields = Object.values(groups).flat()
interface Draft {
  baseline: Frame
  text: Record<Field, string>
  initial: Record<Field, string>
  focused: boolean
  acknowledged: string
}
function groupFor(field: Field): Group {
  if (field === 'title' || field === 'color') return 'appearance'
  return field === 'x' || field === 'y' ? 'move' : 'resize'
}
const copy = (frame: Frame): Frame => ({ ...frame, members: [...frame.members] })
const signature = (frame: Frame) => JSON.stringify([frame.title, frame.color, frame.x, frame.y, frame.w, frame.h, frame.members])
const values = (frame: Frame) => Object.fromEntries(fields.map(key => [key, String(frame[key])])) as Record<Field, string>
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

/** The parent keys this panel by board and frame selection, not by frame metadata. */
export function FramePanel(p: FramePanelProps) {
  const [, redraw] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const mounted = useRef(true)
  const saving = useRef(false)
  const drafts = useRef(Object.fromEntries(groupNames.map(group => [group, {
    baseline: copy(p.frame), text: values(p.frame), initial: values(p.frame), focused: false, acknowledged: '',
  }])) as Record<Group, Draft>)
  const refresh = () => { if (mounted.current) redraw(n => n + 1) }
  const dirty = (group: Group) => groups[group].some(key => drafts.current[group].text[key] !== drafts.current[group].initial[key])
  const reset = (group: Group) => {
    const d = drafts.current[group]
    d.baseline = copy(p.frame)
    d.text = values(p.frame)
    d.initial = values(p.frame)
    d.acknowledged = ''
  }
  useLayoutEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useLayoutEffect(() => {
    let changed = false
    for (const group of groupNames) {
      const d = drafts.current[group]
      if (!d.focused && !dirty(group) && !saving.current && !p.pending && d.acknowledged !== signature(p.frame)) {
        changed ||= groups[group].some(key => d.text[key] !== String(p.frame[key]))
        reset(group)
      }
    }
    if (changed) refresh()
  })
  const locked = p.readOnly || p.pending || saving.current
  const text = (field: Field) => drafts.current[groupFor(field)].text[field]
  const numberValid = (field: Field) => text(field).trim() !== '' && Number.isFinite(Number(text(field))) && (field !== 'w' && field !== 'h' || Number(text(field)) > 0)
  const geometryValid = ['x', 'y', 'w', 'h'].every(field => numberValid(field as Field))
  const bounds: Frame = { ...p.frame, title: text('title').trim() || 'Untitled frame', color: text('color'),
    x: Number(text('x')), y: Number(text('y')), w: Number(text('w')), h: Number(text('h')), members: [...p.frame.members] }
  const captured = p.creating && geometryValid ? p.onCapture(bounds) : []
  const memberIds = p.creating ? captured : p.frame.members
  const hidden = memberIds.filter(id => p.tickets.has(id) && !p.matching.has(id)).length
  const missing = memberIds.filter(id => !p.tickets.has(id)).length

  const save = async (kind: Parameters<FramePanelProps['onSave']>[0]) => {
    if (locked || saving.current) return
    const group = kind === 'move' || kind === 'resize' || kind === 'appearance' ? kind : null
    const editedFields = group ? groups[group] : fields
    if (kind !== 'delete' && editedFields.some(field => !['title', 'color'].includes(field) && !numberValid(field))) {
      setError('Enter finite coordinates and a width and height greater than zero.')
      return
    }
    const baseline = copy(group ? drafts.current[group].baseline : p.frame)
    const next = copy(baseline)
    if (kind !== 'delete') for (const field of editedFields) {
      if (field === 'title' || field === 'color') next[field] = bounds[field]
      else next[field] = bounds[field]
    }
    if (kind === 'create') next.members = [...p.onCapture(next)]
    const submitted = values(next)
    const source = signature(p.frame)
    saving.current = true
    setNotice('')
    refresh()
    try {
      await p.onSave(kind, next, baseline)
      if (!mounted.current) return
      for (const key of group ? [group] : groupNames) {
        const d = drafts.current[key]
        for (const field of groups[key]) d.text[field] = d.initial[field] = submitted[field]
        d.baseline = copy(next)
        // Keep the accepted values if the parent's refresh has not arrived yet.
        d.acknowledged = source
      }
      setError('')
      setNotice(kind === 'delete' ? 'Frame deleted. Tickets and their positions are unchanged.' : 'Frame saved.')
    } catch (failure) {
      if (mounted.current) setError(message(failure))
    } finally {
      saving.current = false
      refresh()
    }
  }
  const cancel = () => {
    if (saving.current || p.pending) { setNotice('The save is still running. Closing this panel does not cancel it.'); return }
    if (groupNames.some(dirty)) {
      for (const group of groupNames) reset(group)
      setNotice('Unsaved edits discarded. Saved operations are unchanged.')
      refresh()
    } else p.onClose()
  }
  const control = (field: Field) => ({
    value: text(field), disabled: locked,
    onFocus: () => { drafts.current[groupFor(field)].focused = true },
    onBlur: () => { drafts.current[groupFor(field)].focused = false; refresh() },
    onInput: (event: Event) => {
      drafts.current[groupFor(field)].text[field] = (event.currentTarget as HTMLInputElement).value
      setNotice('')
      refresh()
    },
  })
  return <aside id="framePanel" class="open" aria-label={p.creating ? 'Create a frame' : 'Frame controls'}>
    <header class="frame-head"><h2>{p.creating ? 'Create a frame' : p.frame.title}</h2>
      <button type="button" onClick={p.onClose} aria-label="Close frame panel">Close</button></header>
    <form class="frame-body" onSubmit={event => event.preventDefault()} onKeyDown={event => {
      if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); cancel() }
    }}>
      {p.readOnly && <p class="frame-notice">Read-only. Frame selection and navigation remain available.</p>}
      {(p.pending || saving.current) && <p role="status">Saving. Closing this panel does not cancel the save.</p>}
      {error && <p class="frame-error" role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <p class="frame-help">{p.creating
        ? 'Capture unassigned card centers, including filtered cards. Cards already in a frame are excluded. No cards move.'
        : 'Move frame and members, including filtered members and members outside the boundary. Resizing changes only the boundary.'}</p>
      <label class="frame-field">Frame title<input type="text" maxLength={80} {...control('title')} /></label>
      <label class="frame-field">Color<select {...control('color')}>
        <option value="#759bcc">Blue</option><option value="#b499be">Plum</option><option value="#89ad97">Sage</option>
      </select></label>
      {!p.creating && <button type="button" disabled={locked} onClick={() => void save('appearance')}>Save title and color</button>}
      <div class="frame-geometry">{(['x', 'y', 'w', 'h'] as const).map(field => <label class="frame-field" key={field}>
        {{ x: 'X', y: 'Y', w: 'Width', h: 'Height' }[field]}
        <input type="number" step="any" min={field === 'w' || field === 'h' ? '0' : undefined} required {...control(field)} />
      </label>)}</div>
      <div class="frame-actions">{p.creating
        ? <button type="button" disabled={locked || !geometryValid} onClick={() => void save('create')}>Create and capture</button>
        : <><button type="button" disabled={locked} onClick={() => void save('move')}>Move frame and members</button>
          <button type="button" disabled={locked} onClick={() => void save('resize')}>Resize boundary only</button></>}
        <button type="button" onClick={cancel}>{p.creating ? 'Cancel creation' : 'Discard unsaved edits'}</button>
      </div>
      <section class="frame-section" aria-label={p.creating ? 'Initial capture' : 'Explicit members'}>
        <h3>{p.creating ? 'Initial capture' : 'Explicit members'}</h3>
        <p aria-live="polite">{p.creating ? `Will capture ${memberIds.length} ${memberIds.length === 1 ? 'card' : 'cards'}`
          : `${memberIds.length} ${memberIds.length === 1 ? 'member' : 'members'}`} · {hidden} filtered · {missing} missing</p>
        {p.creating && !geometryValid && <p>Enter valid bounds to preview capture.</p>}
        <ul class="frame-members">{memberIds.map(id => <li key={id}>{p.tickets.get(id)?.title || id}
          <small>{p.tickets.has(id) ? ` ${id}${!p.matching.has(id) ? ' · Filtered out' : ''}` : ' · Missing ticket'}</small>
        </li>)}</ul>
        {!p.creating && missing > 0 && p.onRemoveMissing && <button type="button" disabled={locked} onClick={() => {
          void p.onRemoveMissing!(memberIds.filter(id => !p.tickets.has(id))).catch(failure => setError(message(failure)))
        }}>Remove missing memberships</button>}
        {!p.creating && <p class="frame-help">Crossing a boundary does not change membership. Select a ticket to add, remove, or transfer it. Filters stay unchanged.</p>}
      </section>
      {!p.creating && <section class="frame-section"><p class="frame-help">Deleting this frame removes assignments only. Tickets and their positions stay unchanged.</p>
        <button type="button" disabled={locked} onClick={() => void save('delete')}>Delete frame only</button></section>}
    </form>
  </aside>
}

export function FrameMembership(p: FrameMembershipProps) {
  const [target, setTarget] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const mounted = useRef(true)
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const current = Object.entries(p.frames).find(([, frame]) => frame.members.includes(p.ticketId))
  const options = Object.entries(p.frames).filter(([id]) => id !== current?.[0])
  const chosen = options.some(([id]) => id === target) ? target : options[0]?.[0] || ''
  const locked = p.readOnly || p.pending || busy
  const change = async (id: string | null) => {
    if (locked || saving.current) return
    saving.current = true
    setBusy(true)
    try {
      await p.onChange(id)
      if (mounted.current) setError('')
    } catch (failure) { if (mounted.current) setError(message(failure)) }
    finally { saving.current = false; if (mounted.current) setBusy(false) }
  }
  return <section class="frame-membership" aria-label="Frame membership">
    <h3>Frame membership</h3>
    <p>{current ? <>Member of <button type="button" onClick={() => p.onSelectFrame(current[0])}>{current[1].title}</button></> : 'No frame membership.'}</p>
    <p class="frame-help">Membership applies even outside the boundary. Adding, removing, or transferring a ticket does not move it.</p>
    {p.readOnly && <p>Read-only. Membership cannot be changed.</p>}
    {(busy || p.pending) && <p role="status">Saving membership. Closing the inspector does not cancel the save.</p>}
    {error && <p role="alert" class="frame-error">{error}</p>}
    <label class="frame-field">Target frame<select disabled={locked || !options.length} value={chosen} onChange={event => setTarget(event.currentTarget.value)}>
      {!options.length && <option value="">No other frames available</option>}
      {options.map(([id, frame]) => <option key={id} value={id}>{frame.title}</option>)}
    </select></label>
    <div class="frame-actions"><button type="button" disabled={locked || !chosen} onClick={() => void change(chosen)}>{current ? 'Move to another frame' : 'Add to frame'}</button>
      <button type="button" disabled={locked || !current} onClick={() => void change(null)}>Remove from frame</button></div>
  </section>
}

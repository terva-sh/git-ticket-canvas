import { memo } from 'preact/compat'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { Density } from '../../platform/canvas/geometry'
import type { Ticket } from '../../platform/tickets/types'

interface CardViewProps {
  ticket: Ticket
  x: number
  y: number
  z: number
  pinned: boolean
  /** An automatic card the board's rules could not place, sitting at the
   * inbox. A question for whoever wrote the rules, so it must look like one. */
  unhoused?: boolean
  selected: boolean
  dimmed: boolean
  target: boolean
  /** Under a link that would close a cycle, so the drop would be refused. */
  refused?: boolean
  frameTitle?: string
  frameMember?: boolean
  /** How much of the ticket to show. Defaults to the full presentation. */
  density?: Density
  /** Whether the link handle is drawn. Not on a phone, which does not write
   * layout or draw relationships by dragging. */
  linkable?: boolean
  /** Hands this card back to automatic placement. Absent on a read-only
   * canvas and on a phone, which is why an absent prop renders a plain label
   * rather than a disabled button. */
  onRelease?: (id: string) => void
  register: (id: string, element: HTMLDivElement) => (() => void)
}

// Memoization keeps metadata out of the per-frame pan and link updates.
export const CardView = memo(function CardView({ ticket: t, x, y, z, pinned, unhoused = false, selected, dimmed, target, refused = false, frameTitle, frameMember, density = 'full', linkable = true, onRelease, register }: CardViewProps) {
  const compact = density === 'compact'
  const element = useRef<HTMLDivElement>(null)
  // Refresh regression diagnostic; unlike DOM mutation counts this sees renders.
  const renders = useRef(0)
  renders.current++
  useLayoutEffect(() => {
    if (element.current) return register(t.id, element.current)
  }, [t.id, register])
  const [labelsOpen, setLabelsOpen] = useState(false)
  const labels = t.labels || []
  const blockers = (t.readiness?.blocking || []).length + (t.readiness?.blockingChildren || []).length
    + (t.readiness?.missing || []).length
  const late = !!t.dueOn && t.dueOn < new Date().toISOString().slice(0, 10)
    && t.status !== 'done' && t.status !== 'archived'
  const labelsId = `labels-${t.id}`
  const ac = t.body?.acceptanceCriteria || []
  const done = ac.filter(item => item.checked).length
  // Compact drops the rows that identify a ticket you have already found, and
  // keeps the ones you scan a board with. Labels carry more of that load once
  // priority, ownership and the id line are gone, so compact shows three chips
  // where full shows two, with the rest behind the same disclosure.
  const shownLabels = compact ? 3 : 2
  // Weight follows actionability rather than lifecycle. A done ticket from
  // March and a startable one blocking three others carried the same weight,
  // and .card.done made that literal by restoring the title colour a neutral
  // border had just taken away.
  const settled = t.status === 'done' || t.status === 'archived'
  const blocked = !!t.readiness?.blocked && !settled
  // What `git ticket ready` answers, which is the most useful fact on a board.
  const startable = !settled && !blocked && !!t.readiness?.ready
  // A claim is advisory and reserves nothing, so an expired one is not a claim.
  const heldBy = !settled && t.claim && !t.claim.expired ? t.claim.actor : ''
  const classes = ['card', compact && 'compact', !pinned && 'unpinned', unhoused && 'unhoused', selected && 'selected', dimmed && 'dimmed',
    frameMember && 'frame-member', target && 'link-target', refused && 'link-refused', t.status === 'done' && 'done', t.status === 'archived' && 'archived',
    blocked && 'blocked-card', startable && 'startable', heldBy && 'claimed'].filter(Boolean).join(' ')
  return <div ref={element} class={classes} data-id={t.id} data-render-count={renders.current}
    style={{ transform: `translate(${x}px, ${y}px)`, zIndex: z, '--status': `var(--s-${t.status})` }}>
    <div class="card-title">{t.title}</div>
    <div class="card-state"><span class="pill status">{t.status}</span>
      {!compact && <span class={`card-priority prio-${t.priority || 'normal'}`}>{t.priority || 'normal'} priority</span>}</div>
    <div class="card-alerts">
      <span class={t.readiness?.blocked ? 'blocked' : startable ? 'startable-mark' : ''}>{t.readiness?.blocked
        ? blockers ? `Blocked by ${blockers}` : 'Blocked'
        : t.readiness?.ready && t.status !== 'ready' ? 'Startable' : 'No blockers'}</span>
      {t.dueOn && <span class={late ? 'late' : ''}>{late ? 'Overdue' : 'Due'} {t.dueOn}</span>}
      {heldBy && <span class="held" title={`Claimed by ${heldBy}`}>{heldBy}</span>}
    </div>
    {!!labels.length && <div class="card-labels" onKeyDown={event => {
      if (event.key === 'Escape' && labelsOpen) { event.stopPropagation(); setLabelsOpen(false) }
    }}>
      {labels.slice(0, shownLabels).map(label => <span key={label} class="pill label" title={label}>{label}</span>)}
      {labels.length > shownLabels && <button class="pill label-more" aria-expanded={labelsOpen} aria-controls={labelsId}
        aria-label={`Show all ${labels.length} labels`} onClick={() => setLabelsOpen(open => !open)}>+{labels.length - shownLabels}</button>}
      {labels.length > shownLabels && <div id={labelsId} class="card-label-disclosure" hidden={!labelsOpen}>
        <span>All labels</span>{labels.map(label => <span key={label} class="pill">{label}</span>)}
      </div>}
    </div>}
    {!compact && (!!t.assignees?.length || t.claim) && <div class="card-ownership">
      {!!t.assignees?.length && <span>Assigned: {t.assignees.join(', ')}</span>}
      {t.claim && <span>Claimed: {t.claim.actor}</span>}
    </div>}
    {!compact && t.milestone && <div class="card-ownership">Milestone: {t.milestone}</div>}
    {!!ac.length && <div class="card-progress"><span>AC {done}/{ac.length}</span>
      <div class="progress" aria-hidden="true"><i style={{ width: `${done / ac.length * 100}%` }} /></div>
    </div>}
    {!compact && frameTitle && <div class="card-frame-membership">Frame: {frameTitle}</div>}
    {!compact && <div class="card-head"><span class="card-id">{t.short || t.id}</span><span class="card-type">{t.type}</span>
      {/* Dragging a card is otherwise a one-way door: it takes a saved
        * position and nothing but editing the layout file gives it back. The
        * label that reports the state is where somebody looks to change it, so
        * the word stays `Manual` and the accessible name says what pressing
        * does. An automatic card has nothing to hand back. */}
      {pinned && onRelease
        ? <button type="button" class="card-placement" data-release={t.id}
          title="Placed by hand. Press to hand it back to automatic placement."
          aria-label={`Hand ${t.short || t.id} back to automatic placement`}
          onClick={() => onRelease(t.id)}>Manual</button>
        : <span class="card-placement" title={unhoused ? 'No rule on this board matches it, so it waits at the inbox.' : undefined}>{pinned ? 'Manual' : unhoused ? 'Unhoused' : 'Automatic'}</span>}</div>}
    {linkable && <div class="handle" title="Drag to another card to make that ticket depend on this one" />}
  </div>
})

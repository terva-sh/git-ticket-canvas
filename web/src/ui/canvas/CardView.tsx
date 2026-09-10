import { memo } from 'preact/compat'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { Ticket } from '../../platform/tickets/types'

export function matches(ticket: Ticket, query: string, filters: ReadonlySet<string>): boolean {
  if (filters.size && !filters.has(ticket.status)) return false
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [ticket.id, ticket.title, ticket.type, ticket.status, ticket.priority, ticket.milestone,
    ...(ticket.labels || []), ...(ticket.assignees || []), ticket.body?.description]
    .filter(Boolean).join(' ').toLowerCase().includes(q)
}

interface CardViewProps {
  ticket: Ticket
  x: number
  y: number
  z: number
  pinned: boolean
  selected: boolean
  dimmed: boolean
  target: boolean
  frameTitle?: string
  frameMember?: boolean
  register: (id: string, element: HTMLDivElement | null) => void
}

// Memoization keeps metadata out of the per-frame pan and link updates.
export const CardView = memo(function CardView({ ticket: t, x, y, z, pinned, selected, dimmed, target, frameTitle, frameMember, register }: CardViewProps) {
  const element = useRef<HTMLDivElement>(null)
  // Refresh regression diagnostic; unlike DOM mutation counts this sees renders.
  const renders = useRef(0)
  renders.current++
  useLayoutEffect(() => {
    register(t.id, element.current)
    return () => register(t.id, null)
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
  const classes = ['card', !pinned && 'unpinned', selected && 'selected', dimmed && 'dimmed',
    frameMember && 'frame-member', target && 'link-target', t.status === 'done' && 'done', t.status === 'archived' && 'archived'].filter(Boolean).join(' ')
  return <div ref={element} class={classes} data-id={t.id} data-render-count={renders.current}
    style={{ transform: `translate(${x}px, ${y}px)`, zIndex: z, '--status': `var(--s-${t.status})` }}>
    <div class="card-title">{t.title}</div>
    <div class="card-state"><span class="pill status">{t.status}</span>
      <span class={`card-priority prio-${t.priority || 'normal'}`}>{t.priority || 'normal'} priority</span></div>
    <div class="card-alerts">
      <span class={t.readiness?.blocked ? 'blocked' : ''}>{t.readiness?.blocked
        ? blockers ? `Blocked by ${blockers}` : 'Blocked'
        : t.readiness?.ready && t.status !== 'ready' ? 'Startable' : 'No blockers'}</span>
      {t.dueOn && <span class={late ? 'late' : ''}>{late ? 'Overdue' : 'Due'} {t.dueOn}</span>}
    </div>
    {!!labels.length && <div class="card-labels" onKeyDown={event => {
      if (event.key === 'Escape' && labelsOpen) { event.stopPropagation(); setLabelsOpen(false) }
    }}>
      {labels.slice(0, 2).map(label => <span key={label} class="pill label" title={label}>{label}</span>)}
      {labels.length > 2 && <button class="pill label-more" aria-expanded={labelsOpen} aria-controls={labelsId}
        aria-label={`Show all ${labels.length} labels`} onClick={() => setLabelsOpen(open => !open)}>+{labels.length - 2}</button>}
      {labels.length > 2 && <div id={labelsId} class="card-label-disclosure" hidden={!labelsOpen}>
        <span>All labels</span>{labels.map(label => <span key={label} class="pill">{label}</span>)}
      </div>}
    </div>}
    {(!!t.assignees?.length || t.claim) && <div class="card-ownership">
      {!!t.assignees?.length && <span>Assigned: {t.assignees.join(', ')}</span>}
      {t.claim && <span>Claimed: {t.claim.actor}</span>}
    </div>}
    {t.milestone && <div class="card-ownership">Milestone: {t.milestone}</div>}
    {!!ac.length && <div class="card-progress"><span>AC {done}/{ac.length}</span>
      <div class="progress" aria-hidden="true"><i style={{ width: `${done / ac.length * 100}%` }} /></div>
    </div>}
    {frameTitle && <div class="card-frame-membership">Frame: {frameTitle}</div>}
    <div class="card-head"><span class="card-id">{t.short || t.id}</span><span class="card-type">{t.type}</span>
      <span class="card-placement">{pinned ? 'Manual' : 'Automatic'}</span></div>
    <div class="handle" title="Drag to another card to make that ticket depend on this one" />
  </div>
})

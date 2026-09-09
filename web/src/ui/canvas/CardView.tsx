import { memo } from 'preact/compat'
import { useLayoutEffect, useRef } from 'preact/hooks'
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
  register: (id: string, element: HTMLDivElement | null) => void
}

// Memoization keeps metadata out of the per-frame pan and link updates.
export const CardView = memo(function CardView({ ticket: t, x, y, z, pinned, selected, dimmed, target, register }: CardViewProps) {
  const element = useRef<HTMLDivElement>(null)
  // Refresh regression diagnostic; unlike DOM mutation counts this sees renders.
  const renders = useRef(0)
  renders.current++
  useLayoutEffect(() => {
    register(t.id, element.current)
    return () => register(t.id, null)
  }, [t.id, register])
  const pills: { text: string; className: string }[] = []
  const pill = (text: string, className = '') => pills.push({ text, className })
  pill(t.status, 'status')
  if (t.priority && t.priority !== 'normal') pill(t.priority, `prio-${t.priority}`)
  if (t.readiness?.ready) {
    if (t.status !== 'ready') pill('startable', 'ready')
  } else if (t.readiness?.blocked) {
    const n = (t.readiness.blocking || []).length + (t.readiness.blockingChildren || []).length
      + (t.readiness.missing || []).length
    pill(n ? `blocked ×${n}` : 'blocked', 'blocked')
  }
  if (t.claim) pill(`◆ ${t.claim.actor}`, 'claim')
  if (t.dueOn) {
    const late = t.dueOn < new Date().toISOString().slice(0, 10) && t.status !== 'done'
    pill(t.dueOn, `due${late ? ' late' : ''}`)
  }
  for (const label of t.labels || []) pill(label)
  if (t.milestone) pill(`◇ ${t.milestone}`)
  const ac = t.body?.acceptanceCriteria || []
  const done = ac.filter(item => item.checked).length
  const classes = ['card', !pinned && 'unpinned', selected && 'selected', dimmed && 'dimmed',
    target && 'link-target', t.status === 'done' && 'done', t.status === 'archived' && 'archived'].filter(Boolean).join(' ')
  return <div ref={element} class={classes} data-id={t.id} data-render-count={renders.current}
    style={{ transform: `translate(${x}px, ${y}px)`, zIndex: z, '--status': `var(--s-${t.status})` }}>
    <div class="card-head"><span class="card-id">{t.short || t.id}</span><span class="card-type">{t.type}</span></div>
    <div class="card-title">{t.title}</div>
    <div class="card-meta">{pills.map((item, index) => <span key={index} class={`pill ${item.className}`}>{item.text}</span>)}</div>
    <div class="progress" hidden={!ac.length} title={ac.length ? `acceptance criteria ${done}/${ac.length}` : undefined}>
      <i style={{ width: `${ac.length ? done / ac.length * 100 : 0}%` }} />
    </div>
    <div class="handle" title="Drag to another card to add a dependency" />
  </div>
})

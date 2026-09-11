import { useState } from 'preact/hooks'
import { CARD_WIDTH, type Point } from '../../platform/canvas/geometry'
import type { Ticket } from '../../platform/tickets/types'

export { CARD_WIDTH }
export type RelationshipMode = 'all' | 'selected' | 'none'
export interface Placement extends Point { pinned: boolean; z: number }
interface Box extends Point { height: number }

function curve(a: Box, b: Box): string {
  if (Math.abs(b.x - a.x) < CARD_WIDTH && (a.y + a.height <= b.y || b.y + b.height <= a.y)) {
    const downward = b.y >= a.y
    const x1 = a.x + CARD_WIDTH / 2, y1 = downward ? a.y + a.height : a.y
    const x2 = b.x + CARD_WIDTH / 2, y2 = downward ? b.y : b.y + b.height
    const middle = (y1 + y2) / 2
    return `M${x1},${y1} C${x1},${middle} ${x2},${middle} ${x2},${y2}`
  }
  const rightward = b.x >= a.x
  const x1 = rightward ? a.x + CARD_WIDTH : a.x, y1 = a.y + a.height / 2
  const x2 = rightward ? b.x : b.x + CARD_WIDTH, y2 = b.y + b.height / 2
  const distance = Math.max(40, Math.abs(x2 - x1) * 0.45)
  const c1 = rightward ? x1 + distance : x1 - distance
  const c2 = rightward ? x2 - distance : x2 + distance
  return `M${x1},${y1} C${c1},${y1} ${c2},${y2} ${x2},${y2}`
}

interface EdgesProps {
  tickets: ReadonlyMap<string, Ticket>
  positions: ReadonlyMap<string, Placement>
  heights: ReadonlyMap<string, number>
  matching: ReadonlySet<string>
  ghost: { from: string; point: Point } | null
  mode?: RelationshipMode
  selection?: ReadonlySet<string>
}

export function Edges({ tickets, positions, heights, matching, ghost, mode = 'selected', selection = new Set<string>() }: EdgesProps) {
  // Hover lives here rather than in Canvas, so pointing at an edge repaints the
  // edge layer and not the cards.
  const [hovered, setHovered] = useState<string | null>(null)
  // One rule decides emphasis. A hovered edge wins outright; otherwise the
  // selection's edges are the emphasised ones. In `selected` mode every rendered
  // edge touches the selection, so nothing fades and the mode keeps its meaning.
  const focused = hovered && positions.size ? hovered : null
  const emphasisActive = !!focused || selection.size > 0
  const box = (id: string): Box => ({ ...positions.get(id)!, height: heights.get(id) ?? 110 })
  const edge = (from: string, to: string, parent: boolean, key: string) => {
    if (!positions.has(from) || !positions.has(to) || mode === 'none'
      || (mode === 'selected' && !selection.has(from) && !selection.has(to))) return null
    const dim = !matching.has(from) || !matching.has(to)
    const emphasised = focused ? key === focused : selection.has(from) || selection.has(to)
    // Filtered out stays faint. Not-this-one stays legible, because the point is
    // to show which edge is which, not to hide the rest.
    const opacity = dim ? 0.12 : emphasisActive && !emphasised ? 0.28 : 1
    const a = box(from), b = box(to)
    const label = parent ? 'parent of' : 'depends on'
    const vertical = Math.abs(b.x - a.x) < CARD_WIDTH
    const labelX = (a.x + b.x + CARD_WIDTH) / 2 + (vertical ? 12 : 0)
    const path = curve(a, b)
    const classes = ['relationship', emphasisActive && (emphasised ? 'emphasised' : 'faded')].filter(Boolean).join(' ')
    return <g key={key} class={classes} data-from={from} data-to={to} data-kind={parent ? 'parent' : 'dependency'}
      data-emphasised={emphasisActive && emphasised ? 'true' : undefined} opacity={opacity}>
      {/* The accessible name stays on every edge, emphasised or not. */}
      <title>{tickets.get(from)?.title} {label} {tickets.get(to)?.title}</title>
      {/* A wide transparent path is the hover target. The visible stroke is too
          thin to point at, especially at fit-to-view scale. */}
      <path class="edge-hit" d={path} fill="none" stroke="transparent" stroke-width="14"
        onPointerEnter={() => setHovered(key)} onPointerLeave={() => setHovered(current => current === key ? null : current)} />
      <path d={path} fill="none" stroke={parent ? 'var(--edge-parent)' : 'var(--edge)'}
        stroke-width={emphasised ? 2.4 : 1.5}
        stroke-dasharray={parent ? '5 5' : undefined}
        marker-end={parent ? 'url(#arrowParent)' : 'url(#arrow)'} />
      {/* One label at a time. Forty-one of them all reading `depends on` or
          `parent of` said nothing the dash and the arrow did not already say. */}
      {emphasised && <text class="edge-label" x={labelX} y={(a.y + a.height / 2 + b.y + b.height / 2) / 2 - 9}
        text-anchor={vertical ? 'start' : 'middle'}>{label}</text>}
    </g>
  }
  const source = ghost && positions.has(ghost.from) ? box(ghost.from) : null
  return <svg id="edges"><g id="edgeLayer">
    {/* A marker's fill does not inherit from the path that references it, so the
        parent colour needs its own marker. */}
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="var(--edge)" />
      </marker>
      <marker id="arrowParent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="var(--edge-parent)" />
      </marker>
    </defs>
    {[...tickets.values()].map(t => t.parent && tickets.has(t.parent) ? edge(t.parent, t.id, true, `parent:${t.id}`) : null)}
    {[...tickets.values()].flatMap(t => (t.dependencies || []).map(dep => tickets.has(dep) ? edge(t.id, dep, false, `dep:${dep}:${t.id}`) : null))}
    {ghost && source && <path id="ghost" d={`M${source.x + CARD_WIDTH},${source.y + source.height / 2} L${ghost.point.x},${ghost.point.y}`}
      stroke="var(--accent)" stroke-width="1.6" stroke-dasharray="4 4" fill="none" />}
  </g></svg>
}
